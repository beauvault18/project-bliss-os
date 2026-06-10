import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { DesktopScene } from '../three/desktop-scene';
import { WindowStore, type Win } from '../ng/window-store';
import { WorkspaceStore, WORKSPACE_COUNT, type CubeSpin, type DesktopMode } from '../ng/workspace-store';
import { WindowBodyDirective } from './window-body.directive';
import { TaskbarComponent } from './taskbar.component';
import { PageVisibilityService } from '../ng/window-visibility';

const SPIN_MS = 950;
/** How far (px) the WebGL camera dollies back at mid-spin (skybox recession). */
const DOLLY_DEPTH = 360;
/** Cursor distance (px) from a screen edge that triggers an edge-flip. A buffer
 *  (not exactly 0/innerWidth) so a fast drag that jumps the frame still fires. */
const EDGE_FLIP_PX = 15;
/** Height of the top "Tube" panel — maximized windows sit below it. */
const PANEL_H = 32;
/** Wobble: drag velocity (px/frame) → skew degrees, and the cap so a fast flick
 *  can't fold the window in on itself. */
const SPRING_TENSION = 0.15;
const MAX_SKEW = 15;
/** Snap-back spring (semi-implicit Euler): F = -k·x - c·v. Underdamped
 *  (c² < 4k) so the window overshoots and wobbles a couple times before resting. */
const WOBBLE_K = 0.18;
const WOBBLE_C = 0.4;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Genie minimize: duration + snappy deceleration toward the taskbar. */
const GENIE_MS = 450;
const GENIE_EASING = 'cubic-bezier(0.25, 1, 0.5, 1)';
/** Fire close: incinerate-and-drift-up duration + accelerating ease. */
const FIRE_MS = 600;
const FIRE_EASING = 'cubic-bezier(0.55, 0.055, 0.675, 0.19)';
/** Window-open "map" animation: zoom-in with a slight overshoot. */
const OPEN_MS = 320;
const OPEN_EASING = 'cubic-bezier(0.2, 0.9, 0.3, 1.25)';
/** Expo overview: face unfold timing + the WebGL camera pull-back while open. */
const EXPO_MS = 600;
const EXPO_EASING = 'cubic-bezier(0.2, 0.8, 0.4, 1.2)';
const EXPO_ZOOM = 420;

/**
 * Root of Project Bliss OS. The window layer IS a CSS-3D cube:
 *   - <canvas> WebGL desktop (sky + stars) renders behind everything
 *   - .cube has 4 full-screen faces (one per workspace), each holding that
 *     workspace's LIVE windows. At rest the active face sits at z=0 → it looks
 *     like a normal flat desktop (1:1, fully interactive).
 *   - switching workspaces plays a pull-back / rotate / push-in animation so the
 *     whole desktop spins to the next face, Compiz-style, windows and all.
 * The cube transform is driven imperatively (Web Animations API) to avoid a
 * one-frame jump between the reactive rest transform and the spin keyframes.
 */
@Component({
  selector: 'app-desktop',
  standalone: true,
  imports: [WindowBodyDirective, TaskbarComponent],
  template: `
    <div class="desktop">
      <canvas #bg class="desktop-bg"></canvas>
      <div
        class="cube-viewport"
        [class.cube-viewport--spin]="!!ws.spin()"
        [class.cube-viewport--expo]="ws.mode() === 'EXPO'"
      >
        <div class="cube" #cube>
          @for (f of workspaceList; track f) {
            <div
              class="cube-face"
              [class.cube-face--active]="f === ws.active()"
              [attr.data-ws]="f"
              [style.transform]="faceTransform(f)"
              (click)="onFaceClick(f)"
            >
              @if (f === ws.active()) {
                <div class="conky" aria-hidden="true">
                  <h1 class="conky__time">{{ clock() }}</h1>
                  <p class="conky__line">{{ conkyCpu() }} · {{ conkyRam() }}</p>
                  <p class="conky__line">OS Bliss OS 2026 · Ubuntu base</p>
                  <p class="conky__line">WM BlissCube · Compiz Engine</p>
                </div>
              }
              @for (w of windowsOn(f); track w.id) {
                <div
                  class="window"
                  [class.window--focused]="w.focused"
                  [class.window--minimized]="w.minimized"
                  [class.window--closing]="w.closing"
                  [style.left.px]="w.x"
                  [style.top.px]="w.y"
                  [style.width.px]="w.w"
                  [style.height.px]="w.h"
                  [style.zIndex]="w.z"
                  [style.transform]="winTransform(w)"
                  data-testid="window"
                  [attr.data-appid]="w.appId"
                  [attr.data-winid]="w.id"
                  [attr.data-ws]="w.workspace"
                  (pointerdown)="store.focus(w.id)"
                >
                  <div
                    class="titlebar titlebar--right"
                    [class.titlebar--blurred]="!w.focused"
                    data-testid="titlebar"
                    (pointerdown)="startDrag(w, $event)"
                    (dblclick)="toggleMaximize(w)"
                  >
                    <span class="titlebar__name">
                      <span class="titlebar__icon">{{ w.icon }}</span>
                      {{ w.title }}
                    </span>
                    <button
                      class="rapid-btn"
                      data-testid="win-min"
                      title="Minimize"
                      (pointerdown)="$event.stopPropagation()"
                      (click)="minimize(w)"
                    >
                      ─
                    </button>
                    <button
                      class="rapid-btn"
                      data-testid="win-max"
                      title="Maximize"
                      (pointerdown)="$event.stopPropagation()"
                      (click)="toggleMaximize(w)"
                    >
                      ▢
                    </button>
                    <button
                      class="rapid-btn"
                      data-testid="win-close"
                      title="Close"
                      (pointerdown)="$event.stopPropagation()"
                      (click)="fireClose(w)"
                    >
                      ✕
                    </button>
                  </div>
                  <div class="window__body">
                    <ng-container [appWindowBody]="w.appId" [winId]="w.id" />
                  </div>
                  <div
                    class="resize-handle"
                    data-testid="resize-handle"
                    (pointerdown)="startResize(w, $event)"
                  ></div>
                </div>
              }
            </div>
          }
        </div>
      </div>
      <app-taskbar />
    </div>
  `,
})
export class DesktopComponent implements AfterViewInit, OnDestroy {
  readonly store = inject(WindowStore);
  readonly ws = inject(WorkspaceStore);
  private pv = inject(PageVisibilityService);
  readonly workspaceList = Array.from({ length: WORKSPACE_COUNT }, (_, i) => i);
  readonly edge = signal(window.innerWidth);
  // Conky desktop clock — a signal ticked each second (zoneless: no CD without it).
  private readonly now = signal(new Date());
  readonly clock = computed(() => {
    const d = this.now();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  private clockTimer?: ReturnType<typeof setInterval>;
  // Live system telemetry for the Conky widget (real CPU/RAM via the Electron bridge).
  private readonly sys = signal<{ cpu: number; ramUsed: number; ramTotal: number } | null>(null);
  readonly conkyCpu = computed(() => {
    const s = this.sys();
    return s ? `CPU ${s.cpu.toFixed(0)}%` : 'CPU --%';
  });
  readonly conkyRam = computed(() => {
    const s = this.sys();
    if (!s) return 'RAM -- / -- GB';
    const gb = (b: number) => (b / 1e9).toFixed(1);
    return `RAM ${gb(s.ramUsed)} / ${(s.ramTotal / 1e9).toFixed(0)} GB`;
  });
  private statsTimer?: ReturnType<typeof setInterval>;

  @ViewChild('bg') private bg!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cube') private cube?: ElementRef<HTMLElement>;
  private scene?: DesktopScene;
  private viewReady = false;
  private wobbleRaf = 0; // active snap-back spring (one at a time)
  /** Cached genie geometry + held forward animation, per minimized window. */
  private genie = new Map<string, { dx: number; dy: number; anim: Animation }>();
  /** Window ids already on screen, so freshly-opened ones get the map animation. */
  private knownWins = new Set<string>();
  private onResize = () => {
    this.scene?.resize();
    this.edge.set(window.innerWidth);
    this.setFlat(this.ws.active());
  };

  constructor() {
    // Spin the cube whenever a workspace switch is requested.
    effect(() => {
      const spin = this.ws.spin();
      if (spin && this.viewReady) this.runSpin(spin);
    });
    // Reverse-genie whenever the taskbar requests a restore.
    effect(() => {
      const id = this.store.restoreReq();
      if (id && this.viewReady) this.restore(id);
    });
    // Pause the WebGL scene while the app is backgrounded (the per-window app
    // loops gate on the same `hidden` signal via WINDOW_VISIBLE).
    effect(() => {
      const hidden = this.pv.hidden();
      if (this.viewReady) this.scene?.setPaused(hidden);
    });
    // Purge genie entries for windows that have been closed (any path) so a
    // minimize-then-close can't orphan a held Animation.
    effect(() => {
      const ids = new Set(this.store.windows().map((w) => w.id));
      for (const [id, g] of this.genie) {
        if (!ids.has(id)) {
          g.anim.cancel();
          this.genie.delete(id);
        }
      }
    });
    // Re-project the cube and dolly the camera when toggling Expo overview.
    effect(() => {
      const mode = this.ws.mode();
      if (this.viewReady) this.applyMode(mode);
    });
    // Play the open "map" animation on any window that's new this tick (and keep
    // the known-id set pruned). Coalesced: a batch of opens animates together.
    effect(() => {
      const wins = this.store.windows();
      const fresh = wins.filter((w) => !this.knownWins.has(w.id)).map((w) => w.id);
      this.knownWins = new Set(wins.map((w) => w.id));
      if (this.viewReady && fresh.length) {
        requestAnimationFrame(() => fresh.forEach((id) => this.animateOpen(id)));
      }
    });
  }

  windowsOn(face: number): Win[] {
    return this.store.windows().filter((w) => w.workspace === face);
  }

  /** A face's position: a cube side (CUBE), or a 2x2 grid cell (EXPO). Reading
   *  ws.mode() makes this reactive, so flipping the mode re-projects the faces
   *  and the .cube-face CSS transition animates the unfold. */
  faceTransform(face: number): string {
    if (this.ws.mode() === 'EXPO') {
      const x = (face % 2 === 0 ? -1 : 1) * 25; // quadrant centers (±25% of viewport)
      const y = (face < 2 ? -1 : 1) * 25;
      return `translate(${x}%, ${y}%) scale(0.46)`;
    }
    return `rotateY(${face * 90}deg) translateZ(${this.edge() / 2}px)`;
  }

  /** In Expo, clicking a workspace thumbnail folds back to it. */
  onFaceClick(face: number): void {
    if (this.ws.mode() === 'EXPO') this.ws.expoSelect(face);
  }

  /**
   * Window transform: wobble skew always; during a cube spin, also push the
   * window off its face on the Z-axis (Compiz "3D Windows" pop-out), staggered
   * by stacking order so overlapping windows separate in depth. Position stays
   * on left/top so the genie/fire transforms (which assume that) keep working.
   */
  winTransform(w: Win): string {
    const skew = `skewX(${w.skewX}deg) skewY(${w.skewY}deg)`;
    if (this.ws.spin()) {
      const depth = 60 + (w.z % 4) * 28;
      return `${skew} translateZ(${depth}px)`;
    }
    // Subtle lift on the focused window at rest — pairs with its neon halo so it
    // floats above the others (a 2D stand-in for Z, which preserve-3d-at-rest
    // would give but at the cost of the glass blur).
    return w.focused ? `${skew} scale(1.012)` : skew;
  }

  ngAfterViewInit(): void {
    this.scene = new DesktopScene(this.bg.nativeElement);
    this.scene.start();
    window.addEventListener('resize', this.onResize);
    this.viewReady = true;
    this.setFlat(this.ws.active());
    this.clockTimer = setInterval(() => this.now.set(new Date()), 1000);
    const pollStats = () => void window.electronAPI?.getSystemStats?.().then((s) => this.sys.set(s)).catch(() => {});
    pollStats();
    this.statsTimer = setInterval(pollStats, 1500);

    // Populate the 4 cube faces with the video layout (workspaces are 0-indexed).
    // Workspace 0 — Math & Logic Terminal
    this.store.open('fractal-engine', { workspace: 0, x: 30, y: 50, w: 600, h: 480 });
    this.store.open('system-terminal', { workspace: 0, x: 30, y: 550, w: 800, h: 360 });
    // Workspace 1 — Space Simulation & Market Analytics
    this.store.open('space-tracker', { workspace: 1, x: 50, y: 50, w: 700, h: 400 });
    this.store.open('market-charts', { workspace: 1, x: 50, y: 480, w: 700, h: 430 });
    // Workspace 2 — Media Stream Engine
    this.store.open('media-streamer', { workspace: 2, x: 150, y: 100, w: 800, h: 500 });
    // Workspace 3 — Diagnostics Panel
    this.store.open('diagnostics', { workspace: 3, x: 40, y: 80, w: 900, h: 600 });

    (window as unknown as { __bliss: unknown }).__bliss = {
      open: (id: string) => this.store.open(id),
      openOrFocus: (id: string) => this.store.openOrFocus(id),
      close: (id: string) => this.store.close(id),
      focus: (id: string) => this.store.focus(id),
      windows: () => this.store.windows(),
      workspace: () => this.ws.active(),
      switchWorkspace: (i: number) => this.ws.switchTo(i),
      moveToWorkspace: (id: string, w: number) => this.store.moveToWorkspace(id, w),
      spinning: () => !!this.ws.spin(),
      minimize: (id: string) => {
        const win = this.store.windows().find((x) => x.id === id);
        if (win) this.minimize(win);
      },
      restore: (id: string) => this.store.requestRestore(id),
      resize: (id: string, w: number, h: number) => this.store.resize(id, w, h),
      toggleMaximize: (id: string) => {
        const win = this.store.windows().find((x) => x.id === id);
        if (win) this.toggleMaximize(win);
      },
      fireClose: (id: string) => {
        const win = this.store.windows().find((x) => x.id === id);
        if (win) this.fireClose(win);
      },
      setHidden: (hidden: boolean) => this.pv.hidden.set(hidden),
      toggleExpo: () => this.ws.toggleExpo(),
      mode: () => this.ws.mode(),
      __genieSize: () => this.genie.size, // debug: held genie animations (leak check)
    };
  }

  /**
   * Switch projection. EXPO: un-rotate the cube and pull the camera back so the
   * faces unfold into a flat 2x2 grid. CUBE: fold back to the active face. The
   * cube transition is added for the morph then cleared so it never fights the
   * WAAPI spin (which only runs in cube mode).
   */
  private applyMode(mode: DesktopMode): void {
    const el = this.cube?.nativeElement;
    if (!el) return;
    el.style.transition = `transform ${EXPO_MS}ms ${EXPO_EASING}`;
    if (mode === 'EXPO') {
      // Grid at the camera plane (z=0) so perspective doesn't spread the cells.
      el.style.transform = `translateZ(0px) rotateY(0deg)`;
      this.scene?.setBaseZoom(EXPO_ZOOM);
    } else {
      this.setFlat(this.ws.active());
      this.scene?.setBaseZoom(0);
      setTimeout(() => {
        if (this.cube?.nativeElement) this.cube.nativeElement.style.transition = '';
      }, EXPO_MS + 40);
    }
  }

  /** Rest pose: active face square-on at z=0 (looks like a flat desktop). */
  private setFlat(face: number): void {
    const el = this.cube?.nativeElement;
    if (!el) return;
    el.style.transform = `translateZ(${-this.edge() / 2}px) rotateY(${-face * 90}deg)`;
    this.scene?.setCubeRotation(-face * 90); // parallax the WebGL world to match
  }

  /** Pull back, rotate to the new face (shortest way), push back in. */
  private runSpin(spin: CubeSpin): void {
    const el = this.cube?.nativeElement;
    if (!el) return;
    const d = this.edge() / 2;
    const fromA = -spin.from * 90;
    let delta = spin.to - spin.from;
    if (delta > 2) delta -= 4;
    if (delta < -2) delta += 4;
    const midA = fromA - delta * 45;
    const endA = fromA - delta * 90;
    this.scene?.setCubeRotation(endA); // start the world parallaxing toward the new face
    this.scene?.pulseDolly(SPIN_MS, DOLLY_DEPTH); // recede the skybox in lockstep with the cube
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
      { duration: SPIN_MS, easing: 'ease-in-out' },
    );
    anim.onfinish = () => {
      this.setFlat(spin.to);
      this.ws.endSpin();
    };
  }

  startDrag(w: Win, e: PointerEvent): void {
    if (this.ws.spin() || this.ws.mode() === 'EXPO') return; // no dragging mid-spin / in overview
    cancelAnimationFrame(this.wobbleRaf); // abort any snap-back still in flight
    let bx = w.x;
    let by = w.y;
    if (w.maximized && w.prevGeom) {
      // Tear loose: restore the pre-maximize SIZE with the titlebar under the cursor.
      const { w: pw, h: ph } = w.prevGeom;
      bx = e.clientX - pw / 2;
      by = Math.max(0, e.clientY - 15);
      this.store.unmaximize(w.id);
      this.store.resize(w.id, pw, ph);
      this.store.move(w.id, bx, by);
    }
    this.store.focus(w.id);
    const offX = e.clientX - bx;
    const offY = e.clientY - by;
    let lastX = e.clientX;
    let lastY = e.clientY;
    // Edge-flip lockout — one flip per spin so holding at the edge doesn't spin
    // through every workspace at once. Per-drag state (each drag gets its own).
    let flipLock = false;
    const move = (ev: PointerEvent) => {
      // Drag past a screen edge → spin to the adjacent workspace and carry the
      // window with it. Listeners live on `window`, so the drag survives the
      // @for reconciliation when the window teleports to the new face.
      if (!flipLock && !this.ws.spin()) {
        const dir =
          ev.clientX <= EDGE_FLIP_PX
            ? -1
            : ev.clientX >= window.innerWidth - EDGE_FLIP_PX
              ? 1
              : 0;
        if (dir !== 0) {
          flipLock = true;
          const target = this.ws.adjacent(dir);
          this.store.dragToWorkspace(w.id, target);
          this.ws.switchTo(target); // reuses the R1 cube spin
          setTimeout(() => (flipLock = false), SPIN_MS);
        }
      }
      // Wobble: skew proportional to this frame's drag velocity (inverted so the
      // window lags behind the cursor), capped so a fast flick can't fold it.
      const sx = clamp((ev.clientX - lastX) * -SPRING_TENSION, -MAX_SKEW, MAX_SKEW);
      const sy = clamp((ev.clientY - lastY) * -SPRING_TENSION, -MAX_SKEW, MAX_SKEW);
      lastX = ev.clientX;
      lastY = ev.clientY;
      this.store.setSkew(w.id, sx, sy);
      // Keep the window glued to the cursor (on whichever face it now lives on).
      this.store.move(w.id, ev.clientX - offX, ev.clientY - offY);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.startWobble(w.id); // elastic snap-back from the released skew
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** Drag the bottom-right handle to resize. Listeners live on `window` so the
   *  drag survives; size/position stay on left/top/width/height, so the wobble
   *  skew (a transform) composes on top untouched. */
  startResize(w: Win, e: PointerEvent): void {
    if (this.ws.spin() || this.ws.mode() === 'EXPO') return;
    e.stopPropagation();
    if (w.maximized) this.store.unmaximize(w.id);
    this.store.focus(w.id);
    const startW = w.w;
    const startH = w.h;
    const ox = e.clientX;
    const oy = e.clientY;
    const move = (ev: PointerEvent) =>
      this.store.resize(w.id, startW + (ev.clientX - ox), startH + (ev.clientY - oy));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** Maximize to fill the workspace (below the panel), or restore. */
  toggleMaximize(w: Win): void {
    if (this.ws.mode() === 'EXPO') return;
    this.store.toggleMaximize(w.id, {
      x: 0,
      y: PANEL_H,
      w: window.innerWidth,
      h: window.innerHeight - PANEL_H,
    });
  }

  /** Decay the released skew to rest with an underdamped spring (Hooke + damping),
   *  so the window overshoots and wobbles to a halt instead of snapping flat. */
  private startWobble(id: string): void {
    cancelAnimationFrame(this.wobbleRaf);
    const cur = this.store.windows().find((w) => w.id === id);
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
        this.store.setSkew(id, 0, 0); // settle exactly flat
        return;
      }
      this.store.setSkew(id, sx, sy);
      this.wobbleRaf = requestAnimationFrame(step);
    };
    step();
  }

  /**
   * Genie minimize: suck the window down into its taskbar button — squeeze
   * horizontally, stretch vertically, then collapse into the icon. The forward
   * animation is held (fill: forwards) so the window stays collapsed/invisible
   * while minimized; we cache the deltas so {@link restore} can reverse it.
   */
  minimize(w: Win): void {
    const el = this.windowEl(w.id);
    const targetEl = document.querySelector<HTMLElement>(`[data-taskwin="${w.id}"]`);
    if (!el || !targetEl) {
      this.store.setMinimized(w.id, true); // can't animate (off-face) → just hide
      return;
    }
    const wr = el.getBoundingClientRect();
    const ir = targetEl.getBoundingClientRect();
    const dx = ir.left + ir.width / 2 - (wr.left + wr.width / 2);
    const dy = ir.top + ir.height / 2 - (wr.top + wr.height / 2);
    const anim = el.animate(this.genieFrames(dx, dy, false), {
      duration: GENIE_MS,
      easing: GENIE_EASING,
      fill: 'forwards',
    });
    this.genie.set(w.id, { dx, dy, anim });
    anim.onfinish = () => this.store.setMinimized(w.id, true);
  }

  /** Reverse-genie: spring the window back out of the taskbar to full size. */
  private restore(id: string): void {
    this.store.endRestore();
    const params = this.genie.get(id);
    const el = this.windowEl(id);
    this.store.setMinimized(id, false);
    if (!el || !params) return; // wasn't animated → already shown by the flag flip
    // Take over with the reverse animation BEFORE cancelling the held forward
    // one, so there's no full-size flash between the two.
    const rev = el.animate(this.genieFrames(params.dx, params.dy, true), {
      duration: GENIE_MS,
      easing: GENIE_EASING,
      fill: 'forwards',
    });
    params.anim.cancel();
    this.genie.delete(id);
    rev.onfinish = () => rev.cancel(); // release transform back to the skew binding
  }

  /** Genie keyframes from the window's center to a taskbar delta (or reversed). */
  private genieFrames(dx: number, dy: number, reverse: boolean): Keyframe[] {
    const frames: Keyframe[] = [
      { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, offset: 0 },
      {
        transform: `translate(${dx * 0.3}px, ${dy * 0.5}px) scale(0.6, 1.2)`,
        opacity: 0.85,
        offset: 0.4,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(0.01, 0.01)`, opacity: 0, offset: 1 },
    ];
    if (!reverse) return frames;
    return frames
      .map((f) => ({ ...f, offset: 1 - (f.offset as number) }))
      .reverse();
  }

  /**
   * Fire close: incinerate the window — flash hot, tint to ember orange/red via
   * filters, blur and drift upward as it burns away — then remove it for real on
   * finish. The window stays in the @for (locked, non-interactive) until the
   * animation completes so the burn is visible.
   */
  fireClose(w: Win): void {
    const el = this.windowEl(w.id);
    if (!el) {
      this.store.close(w.id); // off-face / no node → nothing to burn
      return;
    }
    this.store.setClosing(w.id);
    const anim = el.animate(
      [
        {
          transform: 'translateY(0px) scale(1)',
          filter: 'brightness(1) contrast(1) blur(0px) sepia(0) hue-rotate(0deg) saturate(1)',
          opacity: 1,
          offset: 0,
        },
        {
          transform: 'translateY(-20px) scale(1.02)',
          filter: 'brightness(1.5) contrast(1.2) blur(2px) sepia(1) hue-rotate(-10deg) saturate(3)',
          opacity: 0.9,
          offset: 0.3,
        },
        {
          transform: 'translateY(-80px) scale(0.8) skewX(5deg)',
          filter: 'brightness(0.5) contrast(2) blur(12px) sepia(1) hue-rotate(-30deg) saturate(5)',
          opacity: 0,
          offset: 1,
        },
      ],
      { duration: FIRE_MS, easing: FIRE_EASING, fill: 'forwards' },
    );
    anim.onfinish = () => this.store.close(w.id);
  }

  /** Window "map" animation: zoom in from small + transparent with a slight
   *  overshoot. No fill, so the transform reverts to winTransform on finish. */
  private animateOpen(id: string): void {
    const el = this.windowEl(id);
    if (!el) return;
    el.animate(
      [
        { transform: 'scale(0.72)', opacity: 0, offset: 0 },
        { transform: 'scale(1.04)', opacity: 1, offset: 0.72 },
        { transform: 'scale(1)', opacity: 1, offset: 1 },
      ],
      { duration: OPEN_MS, easing: OPEN_EASING },
    );
  }

  private windowEl(id: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[data-winid="${id}"]`);
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.ws.mode() === 'EXPO') {
      e.preventDefault();
      this.ws.mode.set('CUBE');
      return;
    }
    if (e.ctrlKey && (e.altKey || e.shiftKey)) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.ws.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.ws.prev();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        this.ws.toggleExpo();
      }
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
    clearInterval(this.clockTimer);
    clearInterval(this.statsTimer);
    cancelAnimationFrame(this.wobbleRaf);
    for (const g of this.genie.values()) g.anim.cancel();
    this.genie.clear();
    this.scene?.dispose();
  }
}
