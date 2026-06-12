import * as THREE from 'three';
import type { ScenePaletteColors } from './palette';

export const FLOOR_Y = -260;
const SIZE = 6000;
export const MAX_LIGHTS = 4;

/** One window's projected light on the floor. */
export interface FloorLight {
  x: number; // floor-plane coords (world XZ)
  z: number;
  intensity: number; // 0..1
  color: THREE.Color;
}

/**
 * The neon floor: a single shader plane replacing the two stacked GridHelpers.
 * fwidth-antialiased lines at two scales crossfade with distance (sharper than
 * GridHelper up close, calmer at the horizon), fake-volumetric fog dissolves
 * the far field into the sky color, an accent glow band hugs the horizon, and
 * up to four "window lights" — the focused windows' accent glows, projected
 * from the DOM — pool on the grid like light from panes of glass. Additive
 * blending, so the bloom pass halos the bright lines for free.
 */
export class ShaderFloor {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor() {
    const lights: THREE.Vector3[] = [];
    const lightColors: THREE.Color[] = [];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      lights.push(new THREE.Vector3(0, 0, 0)); // x, z, intensity
      lightColors.push(new THREE.Color(0x000000));
    }
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uGrid: { value: new THREE.Color('#2ad0ff') },
        uGridDim: { value: new THREE.Color('#10416e') },
        uSkyBot: { value: new THREE.Color('#03081f') },
        uLights: { value: lights },
        uLightColors: { value: lightColors },
      },
      vertexShader: `
        varying vec2 vP;
        void main() {
          vP = position.xy; // plane-local, ±${SIZE / 2}
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vP;
        uniform vec3 uGrid, uGridDim, uSkyBot;
        uniform vec3 uLights[${MAX_LIGHTS}];
        uniform vec3 uLightColors[${MAX_LIGHTS}];

        float gridLine(vec2 p, float scale) {
          vec2 q = p / scale;
          vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
          return 1.0 - min(min(g.x, g.y), 1.0);
        }

        void main() {
          float dist = length(vP);
          // Two grid scales, crossfaded by distance (fine near, coarse far).
          float near = gridLine(vP, 64.0);
          float far = gridLine(vP, 256.0);
          float k = smoothstep(400.0, 1800.0, dist);
          float line = mix(near, far * 0.85, k);
          // Radial energy falloff + fake-volumetric horizon fog.
          float fade = 1.0 - smoothstep(500.0, 2600.0, dist);
          vec3 col = mix(uGridDim, uGrid, line) * line * fade * 0.85;
          // Horizon glow band — reads as light haze where the grid dissolves.
          float horizon = smoothstep(1400.0, 2200.0, dist) * (1.0 - smoothstep(2200.0, 3000.0, dist));
          col += uGrid * horizon * 0.05;
          col = mix(col, uSkyBot * 0.4, smoothstep(1800.0, 2900.0, dist));
          // Window lights: focused windows pool their accent glow on the grid.
          for (int i = 0; i < ${MAX_LIGHTS}; i++) {
            vec2 d = vP - uLights[i].xy;
            float falloff = uLights[i].z / (1.0 + dot(d, d) * 0.00006);
            col += uLightColors[i] * falloff * (0.25 + line * 0.75);
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const geo = new THREE.PlaneGeometry(SIZE, SIZE);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = FLOOR_Y;
  }

  setLights(lights: FloorLight[]): void {
    const u = this.mat.uniforms;
    const vecs = u['uLights'].value as THREE.Vector3[];
    const cols = u['uLightColors'].value as THREE.Color[];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = lights[i];
      if (l) {
        vecs[i].set(l.x, l.z, l.intensity);
        cols[i].copy(l.color);
      } else {
        vecs[i].set(0, 0, 0);
      }
    }
  }

  update(p: ScenePaletteColors, lerp: number): void {
    const u = this.mat.uniforms;
    (u['uGrid'].value as THREE.Color).lerp(p.grid, lerp);
    (u['uGridDim'].value as THREE.Color).lerp(p.gridDim, lerp);
    (u['uSkyBot'].value as THREE.Color).lerp(p.skyBot, lerp);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
