import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * The single full-screen "grade" pass appended after bloom: chromatic
 * aberration (rests at a faint lens fringe; pulsed hard during cube spins),
 * film grain, and a soft vignette — one shader, one pass, ~free on hardware
 * GL. SwiftShader never builds a composer at all (the LOW-tier contract).
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uCA: { value: 0.0008 },
    uGrain: { value: 0.035 },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uCA, uGrain, uTime;
    float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 off = (vUv - 0.5) * uCA;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      // Film grain (animated hash noise).
      col += (hash21(vUv * vec2(1613.0, 2731.0) + fract(uTime) * 17.0) - 0.5) * uGrain;
      // Vignette.
      float vig = smoothstep(1.45, 0.55, length(vUv - 0.5) * 1.6);
      col *= mix(0.85, 1.0, vig);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface PostPipeline {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  grade: ShaderPass | null;
}

/**
 * Build the composer for the requested level. Throws are caught by the caller
 * (DesktopScene), which falls back to direct rendering — the two no-bloom
 * paths (SwiftShader gate, defensive catch) both converge on
 * `composer === undefined`.
 */
export function buildPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  level: 'bloom' | 'full',
  dpr: number,
  soft: boolean,
): PostPipeline {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  // (resolution, strength, radius, threshold) — tuned so stars + neon grid
  // lines glow without the dim nebula washing into a haze. 'soft' themes
  // (Hologram White) run gentler bloom so the light scene stays airy.
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), soft ? 0.6 : 1.35, 0.55, 0.62);
  composer.addPass(bloom);
  let grade: ShaderPass | null = null;
  if (level === 'full') {
    grade = new ShaderPass(GradeShader);
    composer.addPass(grade);
  }
  composer.addPass(new OutputPass());
  return { composer, bloom, grade };
}
