import type { DesktopScene } from '../../three/desktop-scene';
import type { WorkspaceStore, CubeSpin, DesktopMode } from '../../ng/workspace-store';
import { ms } from '../../ng/motion';

export const SPIN_MS = 950;
/** How far (px) the WebGL camera dollies back at mid-spin (skybox recession). */
export const DOLLY_DEPTH = 360;
/** Expo overview: face unfold timing + the WebGL camera pull-back while open. */
export const EXPO_MS = 600;
export const EXPO_EASING = 'cubic-bezier(0.2, 0.8, 0.4, 1.2)';
export const EXPO_ZOOM = 420;
/** Free-Look: the held floating cube. Camera pull-back, rest scale, tilt. */
export const FREE_ZOOM = 360;
const FREE_SCALE = 0.52;
const FREE_TILT = -18;
/** Zooming in past this scale "dives" into the nearest face (auto-snap). */
export const FREE_SNAP_SCALE = 0.88;

interface CubeProjectorDeps {
  cube: () => HTMLElement | null;
  scene: () => DesktopScene | undefined;
  /** Viewport width — the cube's half-side is edge()/2. */
  edge: () => number;
  ws: WorkspaceStore;
}

/**
 * Owns the CSS-3D cube's imperative transforms: the flat rest pose, the WAAPI
 * workspace spin, and the CUBE↔EXPO re-projection. The division of labor is
 * deliberate — steady-state face layout is reactive (faceTransform bindings in
 * the desktop template), but the cube container itself is driven imperatively
 * here so the spin keyframes never race an Angular binding (which would cause
 * a one-frame jump between the reactive rest transform and the keyframes).
 */
export class CubeProjector {
  constructor(private deps: CubeProjectorDeps) {}

  // ---- Free-Look: the held, steerable floating cube --------------------
  // Imperative rAF engine (like the spin, never a binding): every value
  // eases toward a target so arrow taps, drags and scroll all feel fluid.
  private freeRaf = 0;
  private freeActive = false;
  private freeExiting = false;
  private freeAngle = 0; // current rotateY (deg, continuous — not wrapped)
  private freeTargetAngle = 0;
  private freeScale = 1;
  private freeTargetScale = FREE_SCALE;
  private freeTilt = 0;
  private freeTargetTilt = FREE_TILT;

  get isFree(): boolean {
    return this.freeActive;
  }

  /** Lift the desktop into the floating cube, starting from `fromFace`. */
  enterFree(fromFace: number): void {
    const el = this.deps.cube();
    if (!el || this.freeActive) return;
    this.freeActive = true;
    this.freeExiting = false;
    this.freeAngle = this.freeTargetAngle = -fromFace * 90;
    this.freeScale = 1;
    this.freeTargetScale = FREE_SCALE;
    this.freeTilt = 0;
    this.freeTargetTilt = FREE_TILT;
    el.style.transition = ''; // the engine owns the transform per-frame
    const scene = this.deps.scene();
    scene?.setBaseZoom(FREE_ZOOM);
    scene?.pulseAberration(ms(500));
    this.freeLastNow = 0;
    this.freeFrame();
  }

  /** Steer: rotate by deg (arrow taps ±90, drags small continuous deltas). */
  rotateFree(deltaDeg: number): void {
    if (!this.freeActive || this.freeExiting) return;
    this.freeTargetAngle += deltaDeg;
  }

  /** Steer: tilt (vertical drag), clamped so the cube never flips over. */
  tiltFree(deltaDeg: number): void {
    if (!this.freeActive || this.freeExiting) return;
    this.freeTargetTilt = Math.max(-38, Math.min(4, this.freeTargetTilt + deltaDeg));
  }

  /** Zoom (scroll wheel). Returns the new target scale so the caller can
   *  auto-snap into the nearest face once it crosses FREE_SNAP_SCALE. */
  zoomFree(delta: number): number {
    if (!this.freeActive || this.freeExiting) return this.freeTargetScale;
    this.freeTargetScale = Math.max(0.3, Math.min(0.95, this.freeTargetScale + delta));
    return this.freeTargetScale;
  }

  /** The face currently nearest the camera (what a snap would land on). */
  nearestFreeFace(): number {
    return ((Math.round(-this.freeTargetAngle / 90) % 4) + 4) % 4;
  }

  /** Snap out of Free-Look into `face`: ease to its flat pose, then hand the
   *  rest transform back to setFlat via onDone (which flips the mode). */
  exitFree(face: number, onDone: () => void): void {
    if (!this.freeActive || this.freeExiting) return;
    this.freeExiting = true;
    // Shortest path to the face's rest angle from the current heading.
    const rest = -face * 90;
    let delta = (rest - this.freeTargetAngle) % 360;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    this.freeTargetAngle += delta;
    this.freeTargetScale = 1;
    this.freeTargetTilt = 0;
    this.freeOnDone = onDone;
  }

  private freeOnDone: (() => void) | null = null;
  private freeLastNow = 0;

  private freeFrame = (): void => {
    if (!this.freeActive) return;
    const el = this.deps.cube();
    if (!el) return;
    // Time-based easing (exp decay over dt) — converges identically at 60 fps
    // or in a throttled hidden window (the headless smoke harness).
    const now = performance.now();
    const dt = this.freeLastNow ? Math.min(0.5, (now - this.freeLastNow) / 1000) : 1 / 60;
    this.freeLastNow = now;
    const k = 1 - Math.exp(-9 * dt);
    this.freeAngle += (this.freeTargetAngle - this.freeAngle) * k;
    this.freeScale += (this.freeTargetScale - this.freeScale) * k;
    this.freeTilt += (this.freeTargetTilt - this.freeTilt) * k;
    const d = this.deps.edge() / 2;
    // Same transform grammar as the spin's mid-keyframe, held steady.
    el.style.transform = `scale(${this.freeScale}) rotateX(${this.freeTilt}deg) translateZ(${-d}px) rotateY(${this.freeAngle}deg)`;
    this.deps.scene()?.setCubeRotation(this.freeAngle); // live parallax under your hand
    if (
      this.freeExiting &&
      Math.abs(this.freeAngle - this.freeTargetAngle) < 0.3 &&
      Math.abs(this.freeScale - this.freeTargetScale) < 0.004 &&
      Math.abs(this.freeTilt) < 0.3
    ) {
      this.freeActive = false;
      this.freeExiting = false;
      cancelAnimationFrame(this.freeRaf);
      const done = this.freeOnDone;
      this.freeOnDone = null;
      done?.();
      return;
    }
    this.freeRaf = requestAnimationFrame(this.freeFrame);
    // Hidden windows throttle rAF to a crawl — keep the engine advancing on a
    // timer backstop so headless runs converge too.
    if (document.hidden) {
      setTimeout(() => {
        if (!this.freeActive) return;
        cancelAnimationFrame(this.freeRaf);
        this.freeFrame();
      }, 40);
    }
  };

  /** Rest pose: active face square-on at z=0 (looks like a flat desktop). */
  setFlat(face: number): void {
    const el = this.deps.cube();
    if (!el) return;
    el.style.transform = `translateZ(${-this.deps.edge() / 2}px) rotateY(${-face * 90}deg)`;
    this.deps.scene()?.setCubeRotation(-face * 90); // parallax the WebGL world to match
  }

  /** Pull back, rotate to the new face (shortest way), push back in. */
  runSpin(spin: CubeSpin): void {
    const el = this.deps.cube();
    if (!el) return;
    const d = this.deps.edge() / 2;
    const fromA = -spin.from * 90;
    let delta = spin.to - spin.from;
    if (delta > 2) delta -= 4;
    if (delta < -2) delta += 4;
    const midA = fromA - delta * 45;
    const endA = fromA - delta * 90;
    const scene = this.deps.scene();
    scene?.setCubeRotation(endA); // start the world parallaxing toward the new face
    scene?.pulseDolly(ms(SPIN_MS), DOLLY_DEPTH); // recede the skybox in lockstep with the cube
    const anim = el.animate(
      [
        { transform: `translateZ(${-d}px) rotateY(${fromA}deg)` },
        {
          // Deeper Compiz pull-back: shrink further and tilt the view down so
          // the box-reflect floor and the skybox grid are revealed around the
          // cube mid-turn, then we push back in to full-screen at the end.
          transform: `scale(0.46) rotateX(-24deg) translateZ(${-d}px) rotateY(${midA}deg)`,
          offset: 0.5,
        },
        { transform: `translateZ(${-d}px) rotateY(${endA}deg)` },
      ],
      { duration: ms(SPIN_MS), easing: 'ease-in-out' },
    );
    anim.onfinish = () => {
      this.setFlat(spin.to);
      this.deps.ws.endSpin();
    };
  }

  /**
   * Switch projection. EXPO: un-rotate the cube and pull the camera back so the
   * faces unfold into a flat 2x2 grid. CUBE: fold back to the active face. The
   * cube transition is added for the morph then cleared so it never fights the
   * WAAPI spin (which only runs in cube mode).
   */
  applyMode(mode: DesktopMode): void {
    const el = this.deps.cube();
    if (!el) return;
    if (mode === 'FREE') return; // the Free-Look rAF engine owns the transform
    el.style.transition = `transform ${ms(EXPO_MS)}ms ${EXPO_EASING}`;
    if (mode === 'EXPO') {
      // Grid at the camera plane (z=0) so perspective doesn't spread the cells.
      el.style.transform = `translateZ(0px) rotateY(0deg)`;
      this.deps.scene()?.setBaseZoom(EXPO_ZOOM);
    } else {
      this.setFlat(this.deps.ws.active());
      this.deps.scene()?.setBaseZoom(0);
      setTimeout(() => {
        const cube = this.deps.cube();
        if (cube) cube.style.transition = '';
      }, ms(EXPO_MS) + 40);
    }
  }
}
