import * as THREE from 'three';
import type { ScenePaletteColors } from './palette';
import { NOISE_GLSL } from './sky';

/**
 * Theme-flagged set pieces behind the skyline:
 *   - AuroraRibbons ('aurora'): two slow-waving additive light bands.
 *   - SynthSun ('sun'): the synthwave horizon disc with scanline cuts.
 * Both fade in/out via a uniform when the active theme's flags change, so
 * theme morphs never pop geometry in or out.
 */
export class AuroraRibbons {
  readonly group = new THREE.Group();
  private mats: THREE.ShaderMaterial[] = [];

  constructor() {
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uAmount: { value: 0 },
          uA: { value: new THREE.Color('#1d3a6e') },
          uB: { value: new THREE.Color('#2ad0ff') },
          uPhase: { value: i * 2.4 },
        },
        vertexShader: `
          varying vec2 vUv;
          uniform float uTime, uPhase;
          void main() {
            vUv = uv;
            vec3 p = position;
            p.y += sin(uv.x * 5.0 + uTime * 0.22 + uPhase) * 36.0;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float uTime, uAmount, uPhase;
          uniform vec3 uA, uB;
          ${NOISE_GLSL}
          void main() {
            float band = fbm(vec3(vUv.x * 3.0, vUv.y * 1.5, uTime * 0.05 + uPhase));
            float mask = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
            float a = mask * smoothstep(0.35, 0.7, band) * 0.16 * uAmount;
            vec3 col = mix(uA, uB, vUv.y);
            gl_FragColor = vec4(col, a);
          }
        `,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3600, 520, 64, 1), mat);
      mesh.position.set(i === 0 ? -300 : 420, 360 + i * 120, -1500 - i * 160);
      this.group.add(mesh);
      this.mats.push(mat);
    }
  }

  update(time: number, p: ScenePaletteColors, lerp: number): void {
    const on = p.flags.has('aurora') ? 1 : 0;
    for (const m of this.mats) {
      m.uniforms['uTime'].value = time;
      m.uniforms['uAmount'].value += (on - m.uniforms['uAmount'].value) * lerp;
      (m.uniforms['uA'].value as THREE.Color).lerp(p.nebulaB, lerp);
      (m.uniforms['uB'].value as THREE.Color).lerp(p.grid, lerp);
    }
  }

  dispose(): void {
    this.group.children.forEach((c) => (c as THREE.Mesh).geometry.dispose());
    this.mats.forEach((m) => m.dispose());
  }
}

export class SynthSun {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uAmount: { value: 0 },
        uTop: { value: new THREE.Color('#ffb347') },
        uBot: { value: new THREE.Color('#ff6ec7') },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uAmount;
        uniform vec3 uTop, uBot;
        void main() {
          vec2 c = vUv - 0.5;
          float disc = smoothstep(0.5, 0.47, length(c));
          // Classic synthwave scanline cuts, widening toward the bottom.
          float cuts = step(0.32 + vUv.y * 0.5, fract(vUv.y * 13.0));
          float a = disc * cuts * uAmount * 0.85;
          vec3 col = mix(uBot, uTop, vUv.y) * 1.6;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), this.mat);
    this.mesh.position.set(0, 80, -1750);
  }

  update(p: ScenePaletteColors, lerp: number): void {
    const on = p.flags.has('sun') ? 1 : 0;
    this.mat.uniforms['uAmount'].value += (on - this.mat.uniforms['uAmount'].value) * lerp;
    (this.mat.uniforms['uTop'].value as THREE.Color).lerp(p.nebulaB, lerp);
    (this.mat.uniforms['uBot'].value as THREE.Color).lerp(p.grid, lerp);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
