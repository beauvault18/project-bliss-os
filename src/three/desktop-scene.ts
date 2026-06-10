import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * The WebGL desktop background, written directly against Three.js (no R3F).
 *
 * R1c: the flat ortho sky becomes a 3D cyberpunk environment the CSS-3D cube is
 * suspended inside. A perspective camera sits at the origin looking down -Z; a
 * wireframe dome, a receding neon floor grid and a ring of wireframe "buildings"
 * give the panoramic city-grid look. The whole environment eases its Y-rotation
 * toward `PARALLAX * cubeAngle` (fed from the workspace store via
 * {@link setCubeRotation}) so the world parallaxes as you turn between faces.
 *
 * The gradient sky is still a fullscreen quad drawn in clip space (it ignores
 * the camera entirely), so it survived the ortho→perspective swap unchanged.
 */
const PARALLAX = 0.15;

export class DesktopScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private env = new THREE.Group();
  private stars: THREE.Points;
  private raf = 0;
  private running = false;
  private targetRot = 0; // eased toward; set from the cube angle
  private curRot = 0;
  private dollyStart = -1; // performance.now() when the spin dolly began (-1 = idle)
  private dollyDur = 0;
  private dollyDepth = 0;
  private baseZoom = 0; // persistent camera pull-back target (e.g. Expo overview)
  private baseZ = 0; // eased current value of baseZoom
  private composer?: EffectComposer; // bloom pipeline; undefined if GL can't support it

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(58, w / h, 0.1, 4000);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);

    // Gradient sky as a fullscreen clip-space quad behind everything. Camera
    // independent — gl_Position is written directly in NDC.
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {},
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
        fragmentShader: `
          varying vec2 vUv;
          void main(){
            vec3 top = vec3(0.04, 0.10, 0.30);
            vec3 bot = vec3(0.01, 0.03, 0.12);
            vec3 col = mix(bot, top, smoothstep(0.0, 1.0, vUv.y));
            float glow = smoothstep(0.55, 0.0, distance(vUv, vec2(0.5, 0.30)));
            col += glow * vec3(0.10, 0.20, 0.45);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.scene.add(sky);

    this.buildEnvironment();
    this.stars = this.buildStars();
    this.env.add(this.stars);
    this.scene.add(this.env);

    this.resize();
    this.initBloom();
  }

  /**
   * Post-processing bloom: only the brightest pixels (stars + neon grid) glow,
   * giving the galaxy that emissive Compiz halo. Wrapped in try/catch so a GL
   * that can't build the float render targets falls back to a direct render
   * instead of crashing the scene.
   */
  private initBloom(): void {
    try {
      // Bloom is multi-pass and expensive; skip it on software GL (SwiftShader),
      // where it would dominate the frame budget. Real GPUs get the full effect.
      const gl = this.renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(
        (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '',
      );
      if (/swiftshader|software|llvmpipe/i.test(name)) return; // → composer stays undefined
      const w = window.innerWidth;
      const h = window.innerHeight;
      const composer = new EffectComposer(this.renderer);
      composer.setPixelRatio(Math.min(devicePixelRatio, 2));
      composer.setSize(w, h);
      composer.addPass(new RenderPass(this.scene, this.camera));
      // (resolution, strength, radius, threshold) — tuned so stars + neon grid
      // lines glow without the dim nebula washing into a haze.
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 1.35, 0.55, 0.62));
      composer.addPass(new OutputPass());
      this.composer = composer;
    } catch (e) {
      console.warn('Bloom unavailable — rendering without post-processing.', e);
      this.composer = undefined;
    }
  }

  /** Galaxy skydome + receding floor grid + a horizon ring of "buildings". */
  private buildEnvironment(): void {
    // Procedural galaxy panorama enclosing the scene (replaces the wireframe sky).
    this.env.add(this.buildGalaxy());

    // Neon floor grids, stacked near/far for depth. GridHelper lines recede to
    // the horizon under the perspective camera → strong parallax cue.
    const near = new THREE.GridHelper(2600, 60, 0x2ad0ff, 0x10416e);
    (near.material as THREE.Material).transparent = true;
    (near.material as THREE.Material).opacity = 0.5;
    near.position.y = -260;
    this.env.add(near);

    const far = new THREE.GridHelper(6000, 40, 0x123a66, 0x0c2746);
    (far.material as THREE.Material).transparent = true;
    (far.material as THREE.Material).opacity = 0.28;
    far.position.y = -262;
    this.env.add(far);

    // Horizon ring of wireframe boxes → distant skyline. Deterministic heights
    // (sin hash) so it's stable frame-to-frame and across reloads.
    const buildings = new THREE.Group();
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x2ad0ff,
      transparent: true,
      opacity: 0.45,
    });
    const RING = 40;
    for (let i = 0; i < RING; i++) {
      const a = (i / RING) * Math.PI * 2;
      const r = 760 + ((Math.sin(i * 53.13) * 0.5 + 0.5) * 220);
      const hgt = 120 + (Math.sin(i * 12.9898) * 0.5 + 0.5) * 520;
      const wdt = 60 + (Math.sin(i * 78.233) * 0.5 + 0.5) * 90;
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(wdt, hgt, wdt)),
        edgeMat,
      );
      box.position.set(Math.cos(a) * r, -260 + hgt / 2, Math.sin(a) * r);
      buildings.add(box);
    }
    this.env.add(buildings);
  }

  /**
   * Procedural galaxy skydome: a starfield + nebula panorama painted to an
   * offscreen canvas (deterministic, so it's stable across reloads) and wrapped
   * onto a large inward-facing sphere. Sits in the env group, so it parallaxes
   * and recedes with the dolly exactly like the old wireframe did.
   */
  private buildGalaxy(): THREE.Mesh {
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

    // Deep-space base gradient.
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#05030f');
    bg.addColorStop(0.5, '#080718');
    bg.addColorStop(1, '#03030a');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // Nebula clouds — soft additive radial gradients in mixed hues.
    g.globalCompositeOperation = 'lighter';
    const hues = ['#3a1d6e', '#1d3a6e', '#6e1d52', '#1d6e63', '#402080', '#23507a'];
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

    // Stars — mostly white, a few warm/cool tints, varied brightness & size.
    for (let i = 0; i < 1500; i++) {
      const x = rand() * W;
      const y = rand() * H;
      const s = rand();
      const size = s > 0.975 ? 1.9 : s > 0.85 ? 1.1 : 0.6;
      const b = (0.5 + rand() * 0.5).toFixed(2);
      const tint = rand();
      g.fillStyle =
        tint > 0.92 ? `rgba(175,205,255,${b})` : tint < 0.08 ? `rgba(255,212,180,${b})` : `rgba(255,255,255,${b})`;
      g.beginPath();
      g.arc(x, y, size, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.SphereGeometry(1000, 60, 40);
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }));
  }

  /** 3D stars on a spherical shell so they parallax with the environment. */
  private buildStars(): THREE.Points {
    const COUNT = 360;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      // Deterministic spherical distribution (golden-angle), upper hemisphere.
      const t = i / COUNT;
      const phi = Math.acos(1 - 1.4 * t); // bias toward the dome top
      const theta = i * 2.39996; // golden angle
      const r = 850;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.9 + 40;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0x9ec3ff, size: 3, transparent: true, opacity: 0.55 }),
    );
  }

  /**
   * Feed the cube's current Y-rotation (deg). The environment eases toward
   * `PARALLAX × angle`, so switching faces drifts the world for parallax.
   */
  setCubeRotation(deg: number): void {
    this.targetRot = THREE.MathUtils.degToRad(deg) * PARALLAX;
  }

  /**
   * Pull the camera back and ease it home over `durationMs`, peaking at the
   * midpoint — call this when a cube spin starts so the WebGL world recedes in
   * lockstep with the CSS cube's pull-back. A timed sin(pi*t) bump guarantees
   * "peak at mid-spin, zero at rest" and self-cancels (no onfinish hook needed).
   */
  pulseDolly(durationMs: number, depth: number): void {
    this.dollyStart = performance.now();
    this.dollyDur = durationMs;
    this.dollyDepth = depth;
  }

  /** Persistent camera pull-back (px), eased — held while in Expo, 0 in cube. */
  setBaseZoom(z: number): void {
    this.baseZoom = z;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      // Ease the world toward the parallax target (decoupled from the WAAPI
      // cube spin, so it stays smooth and never fights it).
      this.curRot += (this.targetRot - this.curRot) * 0.06;
      this.env.rotation.y = this.curRot;
      this.stars.rotation.y += 0.0003; // gentle ambient drift
      // Camera Z = eased persistent base (Expo pull-back) + the spin's sin bump.
      // Position-only → no projection-matrix update; the clip-space sky is fixed.
      let bump = 0;
      if (this.dollyStart >= 0) {
        const t = (performance.now() - this.dollyStart) / this.dollyDur;
        if (t >= 1) this.dollyStart = -1;
        else bump = this.dollyDepth * Math.sin(Math.PI * t);
      }
      this.baseZ += (this.baseZoom - this.baseZ) * 0.08;
      this.camera.position.z = this.baseZ + bump;
      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  /** Pause/resume the render loop — called when the app is backgrounded so the
   *  WebGL scene stops burning frames while hidden. */
  setPaused(paused: boolean): void {
    if (paused) {
      this.running = false;
      cancelAnimationFrame(this.raf);
    } else if (!this.running) {
      this.start();
    }
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose?.();
    });
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
