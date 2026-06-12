import * as THREE from 'three';
import type { ScenePaletteColors } from './palette';

/** Deterministic LCG (Math.random is unavailable in some CI envs). */
const makeRand = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

/**
 * Ambient GPU dust: softly glowing accent-colored motes drifting through the
 * space the cube floats in. All motion is in the vertex shader (uTime), so
 * the CPU cost is one uniform write per frame. During a cube spin, uStretch
 * elongates every mote along Z — the warp-streak effect that sells the dolly.
 * The 'digitalrain' theme flag turns the drift into a steady downpour.
 */
export class DustParticles {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;

  constructor(count: number) {
    const rand = makeRand(0x5f3759df);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 1900;
      positions[i * 3 + 1] = -220 + rand() * 760;
      positions[i * 3 + 2] = -1300 + rand() * 1400;
      seeds[i] = rand() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uStretch: { value: 0 },
        uRain: { value: 0 },
        uColor: { value: new THREE.Color('#2ad0ff') },
      },
      vertexShader: `
        attribute float aSeed;
        uniform float uTime, uStretch, uRain;
        varying float vTw;
        void main() {
          vec3 p = position;
          // Gentle 3-axis drift, unique per mote; rain mode pulls straight down.
          p.x += sin(uTime * 0.10 + aSeed) * 14.0;
          p.y += sin(uTime * 0.13 + aSeed * 1.7) * 10.0 - uRain * mod(uTime * 90.0 + aSeed * 37.0, 760.0);
          p.z += cos(uTime * 0.08 + aSeed * 0.9) * 12.0;
          // Spin streaks: stretch along Z toward the camera at mid-dolly.
          p.z += uStretch * 140.0 * fract(aSeed);
          vTw = 0.55 + 0.45 * sin(uTime * 1.6 + aSeed * 9.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (3.2 + fract(aSeed * 7.3) * 3.4) * (300.0 / max(60.0, -mv.z)) * (1.0 + uStretch * 2.2);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vTw;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d) * 0.28 * vTw;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }

  update(time: number, stretch: number, p: ScenePaletteColors, lerp: number): void {
    const u = this.mat.uniforms;
    u['uTime'].value = time;
    u['uStretch'].value = stretch;
    u['uRain'].value += ((p.flags.has('digitalrain') ? 1 : 0) - u['uRain'].value) * lerp;
    (u['uColor'].value as THREE.Color).lerp(p.grid, lerp);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

interface Streak {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  life: number; // 0..1, -1 = idle
  speed: number;
  nextAt: number; // time when it should (re)launch
}

/**
 * Shooting stars: a fixed pool of six gradient-trail quads launched on random
 * sky chords every few seconds. CPU work is six floats per frame; respawn
 * timing is seeded so headless runs are deterministic.
 */
export class ShootingStars {
  readonly group = new THREE.Group();
  private streaks: Streak[] = [];
  private rand = makeRand(0xc0ffee);

  constructor() {
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uLife: { value: 0 }, uColor: { value: new THREE.Color('#ffffff') } },
        vertexShader: `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float uLife;
          uniform vec3 uColor;
          void main() {
            // Head at uv.x=1, tail fading behind; whole streak fades over life.
            float head = smoothstep(0.0, 1.0, vUv.x);
            float core = smoothstep(0.5, 0.0, abs(vUv.y - 0.5));
            float fade = sin(3.14159 * clamp(uLife, 0.0, 1.0));
            gl_FragColor = vec4(uColor * 1.8, head * core * fade);
          }
        `,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(260, 5), mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.streaks.push({ mesh, mat, life: -1, speed: 0, nextAt: 2 + this.rand() * 7 });
    }
  }

  update(time: number, dt: number, p: ScenePaletteColors, paused: boolean): void {
    for (const s of this.streaks) {
      if (s.life < 0) {
        if (!paused && time >= s.nextAt) {
          // Launch on a random chord high in the sky.
          const a = this.rand() * Math.PI * 2;
          const y = 240 + this.rand() * 420;
          const r = 820;
          s.mesh.position.set(Math.cos(a) * r * 0.7, y, Math.sin(a) * r * 0.7 - 300);
          s.mesh.rotation.z = -0.4 - this.rand() * 0.5;
          s.mesh.rotation.y = a;
          s.mesh.visible = true;
          s.speed = 0.55 + this.rand() * 0.5;
          s.life = 0;
        }
        continue;
      }
      s.life += dt * s.speed;
      s.mesh.translateX(dt * 520);
      (s.mat.uniforms['uLife'].value as number) = s.life;
      s.mat.uniforms['uLife'].value = s.life;
      (s.mat.uniforms['uColor'].value as THREE.Color).lerp(p.star, 0.1);
      if (s.life >= 1) {
        s.life = -1;
        s.mesh.visible = false;
        s.nextAt = time + 4 + this.rand() * 5;
      }
    }
  }

  dispose(): void {
    for (const s of this.streaks) {
      s.mesh.geometry.dispose();
      s.mat.dispose();
    }
  }
}
