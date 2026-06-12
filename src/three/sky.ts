import * as THREE from 'three';
import type { ScenePaletteColors } from './palette';

/** Shared GLSL: IQ-style 3D value noise + 4-octave FBM (deterministic). */
const NOISE_GLSL = `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec3(11.7, 5.3, 7.1);
      a *= 0.5;
    }
    return v;
  }
`;

/**
 * The HIGH/ULTRA sky: a living procedural nebula evaluated per-fragment on the
 * inside of the skydome sphere. One domain-warp step makes the clouds slowly
 * breathe; a hash-grid star layer twinkles per star and is written bright
 * enough (>bloom threshold) that the bloom pass picks individual stars out.
 * All five color uniforms are lerped toward the active theme's palette in the
 * render loop — theme switches morph the entire sky over ~1 s.
 */
export class ShaderSky {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSkyTop: { value: new THREE.Color('#0a1a4d') },
        uSkyBot: { value: new THREE.Color('#03081f') },
        uNebulaA: { value: new THREE.Color('#3a1d6e') },
        uNebulaB: { value: new THREE.Color('#1d3a6e') },
        uNebulaC: { value: new THREE.Color('#6e1d52') },
        uStar: { value: new THREE.Color('#9ec3ff') },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform float uTime;
        uniform vec3 uSkyTop, uSkyBot, uNebulaA, uNebulaB, uNebulaC, uStar;
        ${NOISE_GLSL}
        void main() {
          vec3 dir = normalize(vDir);
          // Breathing nebula: FBM with one slow domain-warp step.
          vec3 warp = vec3(fbm(dir * 3.0 + uTime * 0.008));
          float n1 = fbm(dir * 3.0 + 0.35 * warp);
          float n2 = fbm(dir * 5.5 - uTime * 0.006 + 3.7);
          vec3 base = mix(uSkyBot, uSkyTop, smoothstep(-0.25, 0.75, dir.y));
          vec3 neb = mix(uNebulaA, uNebulaB, smoothstep(0.30, 0.70, n1));
          neb = mix(neb, uNebulaC, smoothstep(0.50, 0.85, n2));
          float amount = smoothstep(0.38, 0.78, n1) * 0.9;
          vec3 col = base + neb * amount;
          // Star layer: sparse hash-grid points with per-star twinkle, written
          // hot so UnrealBloom (threshold 0.62) halos them individually.
          vec3 sp = dir * 90.0;
          vec3 cell = floor(sp);
          float h = hash(cell);
          vec3 f = fract(sp) - 0.5;
          float d = length(f);
          float tw = 0.6 + 0.4 * sin(uTime * 2.0 + h * 40.0);
          float star = step(0.9982, h) * smoothstep(0.16, 0.0, d) * tw;
          col += uStar * star * 2.4;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 60, 40), this.mat);
  }

  update(time: number, p: ScenePaletteColors, lerp: number): void {
    const u = this.mat.uniforms;
    u['uTime'].value = time;
    (u['uSkyTop'].value as THREE.Color).lerp(p.skyTop, lerp);
    (u['uSkyBot'].value as THREE.Color).lerp(p.skyBot, lerp);
    (u['uNebulaA'].value as THREE.Color).lerp(p.nebulaA, lerp);
    (u['uNebulaB'].value as THREE.Color).lerp(p.nebulaB, lerp);
    (u['uNebulaC'].value as THREE.Color).lerp(p.nebulaC, lerp);
    (u['uStar'].value as THREE.Color).lerp(p.star, lerp);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/**
 * The LOW/MED sky: the original deterministic canvas-painted galaxy panorama,
 * now themed — nebula hues come from the active palette and the texture is
 * regenerated once per theme switch (free per-frame, exactly as before).
 */
export function buildCanvasGalaxy(p: ScenePaletteColors): THREE.Mesh {
  const W = 2048;
  const H = 1024;
  const cvs = document.createElement('canvas');
  cvs.width = W;
  cvs.height = H;
  const g = cvs.getContext('2d')!;
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // Deep-space base gradient between the theme's sky stops.
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#' + p.skyBot.clone().lerp(p.skyTop, 0.35).getHexString());
  bg.addColorStop(0.5, '#' + p.skyBot.clone().lerp(p.skyTop, 0.15).getHexString());
  bg.addColorStop(1, '#' + p.skyBot.getHexString());
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // Nebula clouds — soft additive radial gradients in the theme's hues.
  g.globalCompositeOperation = 'lighter';
  const hues = [
    '#' + p.nebulaA.getHexString(),
    '#' + p.nebulaB.getHexString(),
    '#' + p.nebulaC.getHexString(),
    '#' + p.nebulaA.clone().lerp(p.nebulaB, 0.5).getHexString(),
    '#' + p.nebulaB.clone().lerp(p.nebulaC, 0.5).getHexString(),
    '#' + p.nebulaC.clone().lerp(p.nebulaA, 0.5).getHexString(),
  ];
  for (let i = 0; i < 26; i++) {
    const x = rand() * W;
    const y = H * 0.15 + rand() * H * 0.7;
    const r = 120 + rand() * 380;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, hues[Math.floor(rand() * hues.length)]);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.1 + rand() * 0.18;
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // Stars — mostly white, a few tinted toward the theme star color.
  const starHex = '#' + p.star.getHexString();
  for (let i = 0; i < 1500; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const s = rand();
    const size = s > 0.975 ? 1.9 : s > 0.85 ? 1.1 : 0.6;
    const b = 0.5 + rand() * 0.5;
    const tint = rand();
    g.globalAlpha = b;
    g.fillStyle = tint > 0.85 ? starHex : '#ffffff';
    g.beginPath();
    g.arc(x, y, size, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.SphereGeometry(1000, 60, 40);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }));
}

export { NOISE_GLSL };
