import * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderSky, buildCanvasGalaxy } from './sky';
import { ShaderFloor, FLOOR_Y, MAX_LIGHTS, type FloorLight } from './floor';
import { DustParticles, ShootingStars } from './particles';
import { AuroraRibbons, SynthSun } from './aurora';
import { buildPost, type PostPipeline } from './post';
import { TIERS, isSoftwareGL, FpsGovernor, type Tier } from './quality';
import { BLISS_PALETTE, toColors, type ScenePaletteColors, type ScenePaletteInput } from './palette';
import { reducedMotion } from '../ng/motion';

/**
 * The WebGL desktop background, written directly against Three.js (no R3F).
 *
 * Scene 2.0: a quality-tiered, theme-reactive environment the CSS-3D cube is
 * suspended inside. A perspective camera at the origin looks down -Z; the
 * world is assembled from self-contained modules —
 *   sky        shader nebula (HIGH+) or themed canvas galaxy (LOW/MED)
 *   floor      fwidth-antialiased neon grid + horizon fog + window lights
 *   particles  GPU dust (warp-streaked during spins) + shooting stars
 *   set pieces aurora ribbons / synthwave sun / digital rain (theme flags)
 *   post       UnrealBloom + grade pass (chromatic aberration, grain, vignette)
 * Every module lerps its uniforms toward the active ScenePalette each frame,
 * so switching themes morphs the whole world over ~1 s.
 *
 * Contracts preserved from v1: SwiftShader pins tier LOW with NO composer
 * (`composer === undefined` → direct render); the camera only ever moves on
 * Z; the environment eases its Y-rotation toward PARALLAX × the cube angle.
 */
const PARALLAX = 0.15;
const PALETTE_LERP = 0.04;

export class DesktopScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private env = new THREE.Group();
  private raf = 0;
  private running = false;
  private targetRot = 0; // eased toward; set from the cube angle
  private curRot = 0;
  private dollyStart = -1; // performance.now() when the spin dolly began (-1 = idle)
  private dollyDur = 0;
  private dollyDepth = 0;
  private baseZoom = 0; // persistent camera pull-back target (e.g. Expo overview)
  private baseZ = 0; // eased current value of baseZoom
  private composer?: EffectComposer; // undefined = direct render (the contract)

  // --- modules ---
  private gradientQuad: THREE.Mesh;
  private gradientMat: THREE.ShaderMaterial;
  private canvasSky?: THREE.Mesh;
  private shaderSky?: ShaderSky;
  private floor: ShaderFloor;
  private dust?: DustParticles;
  private shooting?: ShootingStars;
  private aurora?: AuroraRibbons;
  private sun?: SynthSun;
  private buildings: THREE.Group;
  private buildingMat: THREE.LineBasicMaterial;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private post?: PostPipeline;

  // --- state ---
  private palette: ScenePaletteColors = toColors(BLISS_PALETTE);
  private readonly software: boolean;
  private tier: Tier;
  private qualitySetting: 'auto' | Tier = 'auto';
  private governor?: FpsGovernor;
  private time = 0;
  private lastNow = 0;
  private aberrStart = -1;
  private aberrDur = 0;
  // Head-coupled parallax targets (eased in the loop like everything else).
  private headTX = 0;
  private headTY = 0;
  private headTZ = 0;
  private headX = 0;
  private headY = 0;
  private headZ = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.software = isSoftwareGL(this.renderer);
    this.tier = this.software ? 'low' : 'med';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, TIERS[this.tier].dprCap));

    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(58, w / h, 0.1, 4000);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);

    // Deep-space gradient as a fullscreen clip-space quad behind everything —
    // camera independent (gl_Position written directly in NDC), themed.
    this.gradientMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color('#0a1a4d') },
        uBot: { value: new THREE.Color('#03081f') },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uTop, uBot;
        void main(){
          vec3 col = mix(uBot, uTop, smoothstep(0.0, 1.0, vUv.y));
          float glow = smoothstep(0.55, 0.0, distance(vUv, vec2(0.5, 0.30)));
          col += glow * uTop * 0.5;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.gradientQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.gradientMat);
    this.gradientQuad.frustumCulled = false;
    this.gradientQuad.renderOrder = -10;
    this.scene.add(this.gradientQuad);

    // Permanent fixtures (all tiers): floor grid, skyline ring, 3D starfield.
    this.floor = new ShaderFloor();
    this.env.add(this.floor.mesh);

    this.buildingMat = new THREE.LineBasicMaterial({
      color: 0x2ad0ff,
      transparent: true,
      opacity: 0.45,
    });
    this.buildings = this.buildSkyline(this.buildingMat);
    this.env.add(this.buildings);

    this.starMat = new THREE.PointsMaterial({
      color: 0x9ec3ff,
      size: 3,
      transparent: true,
      opacity: 0.55,
    });
    this.stars = this.buildStars(this.starMat);
    this.env.add(this.stars);

    this.scene.add(this.env);

    this.resize();
    this.applyTier(this.tier);

    if (!this.software) {
      this.governor = new FpsGovernor(
        () => TIERS[this.tier].dprCap,
        (t) => {
          if (this.qualitySetting === 'auto' && t !== this.tier) this.applyTier(t);
        },
      );
    }
  }

  /** Horizon ring of wireframe boxes → distant skyline. Deterministic heights
   *  (sin hash) so it's stable frame-to-frame and across reloads. */
  private buildSkyline(edgeMat: THREE.LineBasicMaterial): THREE.Group {
    const buildings = new THREE.Group();
    const RING = 40;
    for (let i = 0; i < RING; i++) {
      const a = (i / RING) * Math.PI * 2;
      const r = 760 + (Math.sin(i * 53.13) * 0.5 + 0.5) * 220;
      const hgt = 120 + (Math.sin(i * 12.9898) * 0.5 + 0.5) * 520;
      const wdt = 60 + (Math.sin(i * 78.233) * 0.5 + 0.5) * 90;
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(wdt, hgt, wdt)),
        edgeMat,
      );
      box.position.set(Math.cos(a) * r, FLOOR_Y + hgt / 2, Math.sin(a) * r);
      buildings.add(box);
    }
    return buildings;
  }

  /** 3D stars on a spherical shell so they parallax with the environment. */
  private buildStars(mat: THREE.PointsMaterial): THREE.Points {
    const COUNT = 360;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
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
    return new THREE.Points(geo, mat);
  }

  /** Tear down tier-scoped modules and rebuild for the requested tier. */
  private applyTier(tier: Tier): void {
    const cfg = TIERS[this.software ? 'low' : tier];
    this.tier = this.software ? 'low' : tier;

    // -- dispose the tier-scoped modules --
    if (this.canvasSky) {
      this.env.remove(this.canvasSky);
      this.canvasSky.geometry.dispose();
      const m = this.canvasSky.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.dispose();
      this.canvasSky = undefined;
    }
    if (this.shaderSky) {
      this.env.remove(this.shaderSky.mesh);
      this.shaderSky.dispose();
      this.shaderSky = undefined;
    }
    if (this.dust) {
      this.env.remove(this.dust.points);
      this.dust.dispose();
      this.dust = undefined;
    }
    if (this.shooting) {
      this.env.remove(this.shooting.group);
      this.shooting.dispose();
      this.shooting = undefined;
    }
    if (this.aurora) {
      this.env.remove(this.aurora.group);
      this.aurora.dispose();
      this.aurora = undefined;
    }
    if (this.sun) {
      this.env.remove(this.sun.mesh);
      this.sun.dispose();
      this.sun = undefined;
    }
    this.post?.composer.dispose();
    this.post = undefined;
    this.composer = undefined;

    // -- build for the new tier --
    if (cfg.shaderSky) {
      this.shaderSky = new ShaderSky();
      this.env.add(this.shaderSky.mesh);
    } else {
      this.canvasSky = buildCanvasGalaxy(this.palette);
      this.env.add(this.canvasSky);
    }
    this.dust = new DustParticles(cfg.dustCount);
    this.env.add(this.dust.points);
    if (cfg.shootingStars) {
      this.shooting = new ShootingStars();
      this.env.add(this.shooting.group);
    }
    if (cfg.setPieces) {
      this.aurora = new AuroraRibbons();
      this.env.add(this.aurora.group);
      this.sun = new SynthSun();
      this.env.add(this.sun.mesh);
    }
    if (cfg.composer !== 'none') {
      try {
        const dpr = Math.min(devicePixelRatio, cfg.dprCap);
        this.post = buildPost(
          this.renderer,
          this.scene,
          this.camera,
          cfg.composer,
          dpr,
          this.palette.flags.has('soft'),
        );
        this.composer = this.post.composer;
      } catch (e) {
        console.warn('Bloom unavailable — rendering without post-processing.', e);
        this.post = undefined;
        this.composer = undefined;
      }
    }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, cfg.dprCap));
    this.resize();
  }

  // ------------------------------------------------------------------ API

  /** Feed the cube's current Y-rotation (deg); the world eases toward
   *  PARALLAX × angle so switching faces drifts the environment. */
  setCubeRotation(deg: number): void {
    this.targetRot = THREE.MathUtils.degToRad(deg) * PARALLAX;
  }

  /** Camera recession synced to a cube spin: a timed sin(πt) bump that peaks
   *  at mid-spin and self-cancels. Also pulses the chromatic aberration. */
  pulseDolly(durationMs: number, depth: number): void {
    this.dollyStart = performance.now();
    this.dollyDur = Math.max(1, durationMs);
    this.dollyDepth = depth;
    this.pulseAberration(durationMs);
  }

  /** RGB-split surge over `durationMs` (same self-cancelling envelope). */
  pulseAberration(durationMs: number): void {
    this.aberrStart = performance.now();
    this.aberrDur = Math.max(1, durationMs);
  }

  /** Persistent camera pull-back (px), eased — held while in Expo, 0 in cube. */
  setBaseZoom(z: number): void {
    this.baseZoom = z;
  }

  /** Head-coupled parallax: the viewer's head pose (-1..1 per axis) offsets
   *  the camera — move your head and the galaxy shifts behind the desktop
   *  like a window; lean in and the world draws closer. */
  setHeadOffset(x: number, y: number, depth: number): void {
    this.headTX = x * 70;
    this.headTY = y * 42;
    this.headTZ = depth * 110;
  }

  /** New theme palette — every module lerps toward it (a ~1 s world morph).
   *  The canvas-galaxy tiers repaint their texture once per switch. */
  setPalette(input: ScenePaletteInput): void {
    this.palette = toColors(input);
    if (this.canvasSky) {
      this.env.remove(this.canvasSky);
      this.canvasSky.geometry.dispose();
      const m = this.canvasSky.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.dispose();
      this.canvasSky = buildCanvasGalaxy(this.palette);
      this.env.add(this.canvasSky);
    }
    // Bloom softness is per-theme; rebuild post if the soft flag flipped.
    if (this.post) {
      const soft = this.palette.flags.has('soft');
      this.post.bloom.strength = soft ? 0.6 : 1.35;
    }
  }

  /** Quality override from settings: 'auto' lets the fps governor pick. */
  setQuality(q: 'auto' | Tier): void {
    this.qualitySetting = q;
    if (this.software) return; // pinned LOW
    if (q !== 'auto' && q !== this.tier) this.applyTier(q);
  }

  /** Up to four window lights (normalized screen coords) projected onto the
   *  floor grid — the focused windows literally light the world. */
  setWindowLights(lights: Array<{ nx: number; ny: number; intensity: number; color: string }>): void {
    const mapped: FloorLight[] = lights.slice(0, MAX_LIGHTS).map((l) => ({
      x: (l.nx - 0.5) * 1600,
      z: -(260 + (1 - l.ny) * 700),
      intensity: l.intensity,
      color: new THREE.Color(l.color),
    }));
    this.floor.setLights(mapped);
  }

  /** Current tier (for diagnostics / the Control Center readout). */
  quality(): Tier {
    return this.tier;
  }

  // ----------------------------------------------------------------- loop

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastNow = performance.now();
    const loop = () => {
      if (!this.running) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.lastNow) / 1000);
      this.lastNow = now;
      const frozen = reducedMotion();
      if (!frozen) this.time += dt;

      // Ease the world toward the parallax target (decoupled from the WAAPI
      // cube spin, so it stays smooth and never fights it).
      this.curRot += (this.targetRot - this.curRot) * 0.06;
      this.env.rotation.y = this.curRot;
      if (!frozen) this.stars.rotation.y += 0.0003; // gentle ambient drift

      // Camera Z = eased persistent base (Expo pull-back) + the spin's sin bump.
      // Position-only → no projection-matrix update; the clip-space sky is fixed.
      let bump = 0;
      if (this.dollyStart >= 0) {
        const t = (now - this.dollyStart) / this.dollyDur;
        if (t >= 1) this.dollyStart = -1;
        else bump = this.dollyDepth * Math.sin(Math.PI * t);
      }
      this.baseZ += (this.baseZoom - this.baseZ) * 0.08;
      // Head-coupled parallax: ease the camera toward the viewer's head pose.
      this.headX += (this.headTX - this.headX) * 0.08;
      this.headY += (this.headTY - this.headY) * 0.08;
      this.headZ += (this.headTZ - this.headZ) * 0.08;
      this.camera.position.x = this.headX;
      this.camera.position.y = this.headY;
      this.camera.position.z = this.baseZ + bump - this.headZ;

      // Module updates: palette lerps + time uniforms.
      const p = this.palette;
      const stretch = this.dollyDepth > 0 ? bump / this.dollyDepth : 0;
      this.gradientMat.uniforms['uTop'].value.lerp(p.skyTop, PALETTE_LERP);
      this.gradientMat.uniforms['uBot'].value.lerp(p.skyBot, PALETTE_LERP);
      this.buildingMat.color.lerp(p.building, PALETTE_LERP);
      this.starMat.color.lerp(p.star, PALETTE_LERP);
      this.floor.update(p, PALETTE_LERP);
      this.shaderSky?.update(this.time, p, PALETTE_LERP);
      this.dust?.update(this.time, stretch, p, PALETTE_LERP);
      this.shooting?.update(this.time, frozen ? 0 : dt, p, frozen);
      this.aurora?.update(this.time, p, PALETTE_LERP);
      this.sun?.update(p, PALETTE_LERP);

      // Grade pass: aberration rests at a faint fringe, surges during spins.
      if (this.post?.grade) {
        let ca = 0.0008;
        if (this.aberrStart >= 0) {
          const t = (now - this.aberrStart) / this.aberrDur;
          if (t >= 1) this.aberrStart = -1;
          else ca += 0.0052 * Math.sin(Math.PI * t);
        }
        this.post.grade.uniforms['uCA'].value = ca;
        this.post.grade.uniforms['uTime'].value = this.time;
      }

      // Adaptive DPR (hardware GL only).
      const newDpr = this.governor?.tick(now);
      if (newDpr) {
        this.renderer.setPixelRatio(newDpr);
        this.composer?.setPixelRatio(newDpr);
        this.resize();
      }

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
    this.post?.composer.dispose();
    this.renderer.dispose();
  }
}
