import type { WindowStore, Win } from '../../ng/window-store';
import type { WorkspaceStore } from '../../ng/workspace-store';
import { clamp, windowEl } from './dom';
import { SPIN_MS } from './cube-projector';
import { ms } from '../../ng/motion';

/** Cursor distance (px) from a screen edge that triggers an edge-flip. A buffer
 *  (not exactly 0/innerWidth) so a fast drag that jumps the frame still fires. */
export const EDGE_FLIP_PX = 15;
/** The magnetic snap band: between the edge-flip strip and this many px from
 *  the edge. Edge-flip always wins inside its strip — explicit precedence. */
const SNAP_BAND_PX = 40;
/** Height of the top "Tube" panel — snap regions sit below it. */
const PANEL_H = 32;
/** Wobble: drag velocity (px/frame) → skew degrees, and the cap so a fast flick
 *  can't fold the window in on itself. */
const SPRING_TENSION = 0.15;
const MAX_SKEW = 15;
/** Snap-back spring (semi-implicit Euler): F = -k·x - c·v. Underdamped
 *  (c² < 4k) so the window overshoots and wobbles a couple times before resting. */
const WOBBLE_K = 0.18;
const WOBBLE_C = 0.4;
/** Aero-shake: this many horizontal direction reversals (≥18 px swings)
 *  within the window genie-minimizes every other window on the face. */
const SHAKE_REVERSALS = 4;
const SHAKE_WINDOW_MS = 600;
const SHAKE_COOLDOWN_MS = 1500;

export interface SnapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DragControllerDeps {
  store: WindowStore;
  ws: WorkspaceStore;
  /** Live snap-zone preview (holographic rect) — null clears it. */
  onSnapPreview: (rect: SnapRect | null) => void;
  /** Aero-shake detected: minimize every other window on this window's face. */
  onShake: (w: Win) => void;
  /** Gesture-coupled sound hooks. */
  sound: { snap: () => void; edgeFlip: () => void };
}

/**
 * Owns the pointer-driven systems: titlebar drag (edge-flip, wobble, magnetic
 * snap zones, aero-shake), Expo cross-face drag, resize, and the underdamped
 * snap-back spring. Listeners live on `window`, not the window element, so a
 * drag survives the @for reconciliation when a window teleports faces.
 *
 * Geometry rules (load-bearing): position/size live on left/top/width/height;
 * ONLY skew lives on transform. The snap glide therefore animates left/top
 * via a transient CSS transition class — never transform — so it can't fight
 * the wobble binding or the genie/fire one-shots.
 */
export class DragController {
  private wobbleRaf = 0; // active snap-back spring (one at a time)
  private lastShakeAt = 0;

  constructor(private deps: DragControllerDeps) {}

  startDrag(w: Win, e: PointerEvent): void {
    const { store, ws } = this.deps;
    if (ws.spin() || ws.mode() === 'FREE') return; // no dragging mid-spin / on the held cube
    if (ws.mode() === 'EXPO') {
      this.startExpoDrag(w, e);
      return;
    }
    this.cancelWobble(); // abort any snap-back still in flight
    let bx = w.x;
    let by = w.y;
    if (w.maximized && w.prevGeom) {
      // Tear loose: restore the pre-maximize SIZE with the titlebar under the cursor.
      const { w: pw, h: ph } = w.prevGeom;
      bx = e.clientX - pw / 2;
      by = Math.max(0, e.clientY - 15);
      store.unmaximize(w.id);
      store.resize(w.id, pw, ph);
      store.move(w.id, bx, by);
    }
    store.focus(w.id);
    const offX = e.clientX - bx;
    const offY = e.clientY - by;
    let lastX = e.clientX;
    let lastY = e.clientY;
    // Edge-flip lockout — one flip per spin so holding at the edge doesn't spin
    // through every workspace at once. Per-drag state (each drag gets its own).
    let flipLock = false;
    let snapRect: SnapRect | null = null;
    // Aero-shake bookkeeping.
    let lastDir = 0;
    let reversals: number[] = [];
    const move = (ev: PointerEvent) => {
      // Drag past a screen edge → spin to the adjacent workspace and carry the
      // window with it. Edge-flip has priority over the snap band.
      if (!flipLock && !ws.spin()) {
        const dir =
          ev.clientX <= EDGE_FLIP_PX
            ? -1
            : ev.clientX >= window.innerWidth - EDGE_FLIP_PX
              ? 1
              : 0;
        if (dir !== 0) {
          flipLock = true;
          snapRect = null;
          this.deps.onSnapPreview(null);
          this.deps.sound.edgeFlip();
          const target = ws.adjacent(dir);
          store.dragToWorkspace(w.id, target);
          ws.switchTo(target); // reuses the cube spin
          setTimeout(() => (flipLock = false), ms(SPIN_MS));
        }
      }
      // Magnetic snap zones (left/right halves, corner quarters, top maximize),
      // armed only OUTSIDE the edge-flip strip.
      snapRect = this.snapZoneAt(ev.clientX, ev.clientY);
      this.deps.onSnapPreview(snapRect);
      // Wobble: skew proportional to this frame's drag velocity (inverted so the
      // window lags behind the cursor), capped so a fast flick can't fold it.
      const dx = ev.clientX - lastX;
      const sx = clamp(dx * -SPRING_TENSION, -MAX_SKEW, MAX_SKEW);
      const sy = clamp((ev.clientY - lastY) * -SPRING_TENSION, -MAX_SKEW, MAX_SKEW);
      lastX = ev.clientX;
      lastY = ev.clientY;
      store.setSkew(w.id, sx, sy);
      // Keep the window glued to the cursor (on whichever face it now lives on).
      store.move(w.id, ev.clientX - offX, ev.clientY - offY);
      // Aero-shake: count quick horizontal direction reversals.
      if (Math.abs(dx) > 18) {
        const dir = Math.sign(dx);
        const now = performance.now();
        if (lastDir !== 0 && dir !== lastDir) {
          reversals.push(now);
          reversals = reversals.filter((t) => now - t < SHAKE_WINDOW_MS);
          if (reversals.length >= SHAKE_REVERSALS && now - this.lastShakeAt > SHAKE_COOLDOWN_MS) {
            this.lastShakeAt = now;
            reversals = [];
            this.deps.onShake(w);
          }
        }
        lastDir = dir;
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.deps.onSnapPreview(null);
      if (snapRect) {
        // Commit the snap with a CSS glide on left/top/width/height (a class,
        // not a transform — the skew binding keeps sole transform ownership).
        this.cancelWobble();
        this.deps.store.setSkew(w.id, 0, 0);
        this.deps.sound.snap();
        const el = windowEl(w.id);
        el?.classList.add('window--snapping');
        this.deps.store.snapTo(w.id, snapRect);
        setTimeout(() => el?.classList.remove('window--snapping'), ms(220) + 30);
        return;
      }
      this.startWobble(w.id); // elastic snap-back from the released skew
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** The snap region for a cursor position, or null outside the bands. */
  private snapZoneAt(x: number, y: number): SnapRect | null {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const workH = H - PANEL_H;
    const halfH = Math.floor(workH / 2);
    const side =
      x > EDGE_FLIP_PX && x <= SNAP_BAND_PX ? 'left' : x < W - EDGE_FLIP_PX && x >= W - SNAP_BAND_PX ? 'right' : null;
    if (side) {
      const sx = side === 'left' ? 0 : Math.ceil(W / 2);
      const sw = side === 'left' ? Math.floor(W / 2) : W - Math.ceil(W / 2);
      // Corner quarters in the top/bottom thirds of the band; half otherwise.
      if (y < PANEL_H + workH * 0.3) return { x: sx, y: PANEL_H, w: sw, h: halfH };
      if (y > PANEL_H + workH * 0.7) return { x: sx, y: PANEL_H + halfH, w: sw, h: workH - halfH };
      return { x: sx, y: PANEL_H, w: sw, h: workH };
    }
    // Top band (below the panel) → maximize.
    if (y <= PANEL_H + 10 && x > SNAP_BAND_PX && x < W - SNAP_BAND_PX) {
      return { x: 0, y: PANEL_H, w: W, h: workH };
    }
    return null;
  }

  /**
   * Expo drag: lift a window off its thumbnail and drop it on another
   * workspace's face. A sub-8px movement counts as a click → selects the
   * workspace (preserving the existing Expo click affordance).
   */
  private startExpoDrag(w: Win, e: PointerEvent): void {
    const { store, ws } = this.deps;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const el = windowEl(w.id);
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 8) return;
      moved = true;
      // Counter the 0.46 face scale so the window tracks the cursor 1:1.
      const k = 1 / 0.46;
      store.move(w.id, w.x + (ev.clientX - startX) * k, w.y + (ev.clientY - startY) * k);
      el?.classList.add('window--expo-lift');
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el?.classList.remove('window--expo-lift');
      if (!moved) {
        ws.expoSelect(w.workspace); // plain click → choose the workspace
        return;
      }
      const face = (ev.target instanceof Element ? ev.target : document.elementFromPoint(ev.clientX, ev.clientY))
        ?.closest?.('[data-ws]');
      const target = face ? Number((face as HTMLElement).dataset['ws']) : NaN;
      if (Number.isInteger(target) && target !== w.workspace) {
        store.moveToWorkspace(w.id, target);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** Drag the bottom-right handle to resize. Size lives on width/height (not
   *  transform), so the wobble skew composes on top untouched. */
  startResize(w: Win, e: PointerEvent): void {
    const { store, ws } = this.deps;
    if (ws.spin() || ws.mode() === 'EXPO') return;
    e.stopPropagation();
    if (w.maximized) store.unmaximize(w.id);
    store.focus(w.id);
    const startW = w.w;
    const startH = w.h;
    const ox = e.clientX;
    const oy = e.clientY;
    const move = (ev: PointerEvent) =>
      store.resize(w.id, startW + (ev.clientX - ox), startH + (ev.clientY - oy));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** Decay the released skew to rest with an underdamped spring (Hooke + damping),
   *  so the window overshoots and wobbles to a halt instead of snapping flat. */
  private startWobble(id: string): void {
    this.cancelWobble();
    const store = this.deps.store;
    const cur = store.windows().find((w) => w.id === id);
    if (!cur) return;
    let sx = cur.skewX;
    let sy = cur.skewY;
    let vx = 0;
    let vy = 0;
    const step = () => {
      vx += -WOBBLE_K * sx - WOBBLE_C * vx;
      vy += -WOBBLE_K * sy - WOBBLE_C * vy;
      sx += vx;
      sy += vy;
      if (Math.abs(sx) < 0.05 && Math.abs(vx) < 0.05 && Math.abs(sy) < 0.05 && Math.abs(vy) < 0.05) {
        store.setSkew(id, 0, 0); // settle exactly flat
        return;
      }
      store.setSkew(id, sx, sy);
      this.wobbleRaf = requestAnimationFrame(step);
    };
    step();
  }

  /** Abort any snap-back in flight — required before any one-shot animation
   *  (snap glide, genie) takes over the window's geometry. */
  cancelWobble(): void {
    cancelAnimationFrame(this.wobbleRaf);
  }

  dispose(): void {
    this.cancelWobble();
  }
}
