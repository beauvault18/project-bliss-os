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
  untracked,
  ViewChild,
} from '@angular/core';
import { DesktopScene } from '../three/desktop-scene';
import { WindowStore, type Win } from '../ng/window-store';
import { WorkspaceStore, WORKSPACE_COUNT } from '../ng/workspace-store';
import { WindowBodyDirective } from './window-body.directive';
import { TaskbarComponent } from './taskbar.component';
import { SwitcherComponent } from './switcher.component';
import { CommandPaletteComponent } from './command-palette.component';
import { ToastsComponent } from './toasts.component';
import { BootScreenComponent } from './boot-screen.component';
import { LockScreenComponent } from './lock-screen.component';
import { SoundService } from '../ng/sound.service';
import { NotificationService } from '../ng/notification.service';
import { PageVisibilityService } from '../ng/window-visibility';
import { ContextMenuService, type MenuItem } from '../ng/context-menu.service';
import { HeadTrackingService } from '../ng/head-tracking.service';
import { ThemeService } from '../ng/theme.service';
import { SettingsService } from '../ng/settings.service';
import { PersistService } from '../ng/persist.service';
import { seedDemoLayout } from '../ng/demo-layout';
import { CubeProjector, FREE_SNAP_SCALE } from './desktop/cube-projector';
import { DragController, type SnapRect } from './desktop/drag-controller';
import { EffectsPlayer } from './desktop/effects-player';
import { GenieManager } from './desktop/genie-manager';
import { ConkyComponent } from './desktop/conky.component';
import { installBlissApi } from './desktop/bliss-test-api';

/** Height of the top "Tube" panel — maximized windows sit below it. */
const PANEL_H = 32;

/**
 * Root of Project Bliss OS. The window layer IS a CSS-3D cube:
 *   - <canvas> WebGL desktop (sky + stars) renders behind everything
 *   - .cube has 4 full-screen faces (one per workspace), each holding that
 *     workspace's LIVE windows. At rest the active face sits at z=0 → it looks
 *     like a normal flat desktop (1:1, fully interactive).
 *   - switching workspaces plays a pull-back / rotate / push-in animation so the
 *     whole desktop spins to the next face, Compiz-style, windows and all.
 *
 * The component is the reactive conductor; the imperative animation systems
 * live in ./desktop/ as plain classes (CubeProjector, DragController,
 * GenieManager, EffectsPlayer), constructed once the view exists. Division of
 * labor: signals own steady-state (face layout, skew, focus lift) and WAAPI
 * owns one-shots (spin, genie, fire, open) — never both on one property.
 */
@Component({
  selector: 'app-desktop',
  standalone: true,
  imports: [
    WindowBodyDirective,
    TaskbarComponent,
    ConkyComponent,
    SwitcherComponent,
    CommandPaletteComponent,
    ToastsComponent,
    BootScreenComponent,
    LockScreenComponent,
  ],
  template: `
    <div class="desktop">
      <canvas #bg class="desktop-bg"></canvas>
      <div
        class="cube-viewport"
        [class.cube-viewport--spin]="!!ws.spin()"
        [class.cube-viewport--expo]="ws.mode() === 'EXPO'"
        [class.cube-viewport--free]="ws.mode() === 'FREE'"
        [style.perspective-origin]="perspectiveOrigin()"
      >
        <div class="cube" #cube>
          @for (f of workspaceList; track f) {
            <div
              class="cube-face"
              [class.cube-face--active]="f === ws.active()"
              [attr.data-ws]="f"
              [style.transform]="faceTransform(f)"
              (click)="onFaceClick(f)"
              (pointerdown)="onFacePointerDown(f, $event)"
              (contextmenu)="onDesktopMenu($event)"
            >
              @if (f === ws.active()) {
                <app-conky />
              }
              @for (w of windowsOn(f); track w.id) {
                <div
                  class="window"
                  [class.window--focused]="w.focused"
                  [class.window--minimized]="w.minimized"
                  [class.window--closing]="w.closing"
                  [class.window--peek-dim]="!!store.peekId() && store.peekId() !== w.id"
                  [style.left.px]="w.x"
                  [style.top.px]="w.y"
                  [style.width.px]="w.w"
                  [style.height.px]="w.h"
                  [style.zIndex]="w.z + (w.pinned ? 1000000 : 0)"
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
                    (pointerdown)="drag.startDrag(w, $event)"
                    (dblclick)="toggleMaximize(w)"
                    (contextmenu)="onTitlebarMenu(w, $event)"
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
                    (pointerdown)="drag.startResize(w, $event)"
                  ></div>
                </div>
              }
            </div>
          }
        </div>
      </div>
      @if (snapPreview(); as sp) {
        <div
          class="snap-preview"
          [style.left.px]="sp.x"
          [style.top.px]="sp.y"
          [style.width.px]="sp.w"
          [style.height.px]="sp.h"
        ></div>
      }
      @if (ws.mode() === 'FREE') {
        <div class="free-hint" data-testid="free-hint">
          <b>drag / ← →</b> rotate · <b>scroll</b> zoom · <b>click a face</b> to dive in ·
          <b>Esc</b> snap out
        </div>
      }
      <app-switcher #switcher />
      <app-command-palette #palette />
      <app-toasts />
      <app-lock-screen />
      <app-boot-screen />
      @if (cm.menu(); as m) {
        <div
          class="ctx-scrim"
          (click)="cm.close()"
          (contextmenu)="$event.preventDefault(); cm.close()"
        ></div>
        <div class="ctx-menu" data-testid="context-menu" [style.left.px]="m.x" [style.top.px]="m.y">
          @for (item of m.items; track $index) {
            @if (item.separator) {
              <div class="ctx-sep"></div>
            } @else {
              <button
                class="ctx-item"
                [class.ctx-item--danger]="item.danger"
                [disabled]="item.disabled"
                (click)="runMenu(item)"
              >
                <span class="ctx-glyph">{{ item.glyph ?? '' }}</span>
                {{ item.label }}
              </button>
            }
          }
        </div>
      }
      <app-taskbar />
    </div>
  `,
})
export class DesktopComponent implements AfterViewInit, OnDestroy {
  readonly store = inject(WindowStore);
  readonly ws = inject(WorkspaceStore);
  private pv = inject(PageVisibilityService);
  /** Injected for its boot-time side effect: applies the persisted theme
   *  attribute (and, once the scene exists, drives its palette morphs). */
  readonly themes = inject(ThemeService);
  /** Boot side effects: hydrates user prefs + arms the global motion scale. */
  readonly settings = inject(SettingsService);
  private persist = inject(PersistService);
  readonly workspaceList = Array.from({ length: WORKSPACE_COUNT }, (_, i) => i);
  readonly edge = signal(window.innerWidth);

  readonly cm = inject(ContextMenuService);
  /** Synthesized UI sound: reactive moments self-wire via its effects;
   *  gesture-coupled calls below. */
  readonly sound = inject(SoundService);
  readonly notif = inject(NotificationService);
  /** Head-coupled parallax (webcam, on-device). */
  readonly headTrack = inject(HeadTrackingService);

  /** The vanishing point follows your head — the cube (especially while
   *  floating in Free-Look) renders as if seen from where you actually are. */
  readonly perspectiveOrigin = computed(() => {
    const h = this.headTrack.head();
    return `calc(50% + ${(h.x * 7).toFixed(2)}%) calc(45% - ${(h.y * 6).toFixed(2)}%)`;
  });

  @ViewChild('bg') private bg!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cube') private cube?: ElementRef<HTMLElement>;
  @ViewChild('switcher') private switcher?: SwitcherComponent;
  @ViewChild('palette') private palette?: CommandPaletteComponent;
  private scene?: DesktopScene;
  private viewReady = false;

  /** Live magnetic-snap preview rect while a drag hovers a snap band. */
  readonly snapPreview = signal<SnapRect | null>(null);

  // Imperative animation systems (constructed in ngAfterViewInit).
  private cubeProj = new CubeProjector({
    cube: () => this.cube?.nativeElement ?? null,
    scene: () => this.scene,
    edge: () => this.edge(),
    ws: this.ws,
  });
  readonly drag = new DragController({
    store: this.store,
    ws: this.ws,
    onSnapPreview: (rect) => this.snapPreview.set(rect),
    // Aero-shake: genie-minimize every other window on the shaken window's face.
    onShake: (w) => {
      for (const other of this.store.windows()) {
        if (other.id !== w.id && other.workspace === w.workspace && !other.minimized) {
          this.minimize(other);
        }
      }
    },
    sound: {
      snap: () => this.sound.snap(),
      edgeFlip: () => this.sound.edgeFlip(),
    },
  });
  private effects = new EffectsPlayer(this.store);
  private genieMgr = new GenieManager(this.store);

  /** Window ids already on screen, so freshly-opened ones get the map animation. */
  private knownWins = new Set<string>();
  private onResize = () => {
    this.scene?.resize();
    this.edge.set(window.innerWidth);
    this.cubeProj.setFlat(this.ws.active());
  };

  constructor() {
    // Spin the cube whenever a workspace switch is requested.
    effect(() => {
      const spin = this.ws.spin();
      if (spin && this.viewReady) this.cubeProj.runSpin(spin);
    });
    // Reverse-genie whenever the taskbar requests a restore.
    effect(() => {
      const id = this.store.restoreReq();
      if (id && this.viewReady) {
        this.sound.genie(true);
        this.genieMgr.restore(id);
      }
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
      this.genieMgr.purge(ids);
    });
    // Re-project the cube and dolly the camera when toggling Expo overview.
    effect(() => {
      const mode = this.ws.mode();
      if (this.viewReady) this.cubeProj.applyMode(mode);
    });
    // Free-Look toggle requests (taskbar ◳, Ctrl+Alt+Down, __bliss hook).
    // Only the request counter is tracked — mode is read untracked, or the
    // mode flip inside enterFreeLook would re-fire this effect and bounce
    // straight back out.
    effect(() => {
      const req = this.ws.freeLookReq();
      if (!req || !this.viewReady) return;
      untracked(() => {
        if (this.ws.mode() === 'CUBE' && !this.ws.spin()) this.enterFreeLook();
        else if (this.ws.mode() === 'FREE') this.exitFreeLook();
      });
    });
    // Head-coupled parallax fan-out: the WebGL camera shifts with your head,
    // and --head-x/--head-y feed the Conky widget's counter-drift.
    effect(() => {
      const h = this.headTrack.head();
      if (!this.viewReady) return;
      this.scene?.setHeadOffset(h.x, h.y, h.depth);
      const el = document.documentElement;
      el.style.setProperty('--head-x', h.x.toFixed(3));
      el.style.setProperty('--head-y', h.y.toFixed(3));
    });
    // Windows light the WebGL world: the focused window pools its accent glow
    // on the floor grid (a big center pool while the cube floats in Free-Look).
    effect(() => {
      const mode = this.ws.mode();
      const wins = this.store.windows();
      if (!this.viewReady) return;
      const accent =
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00c8ff';
      if (mode === 'FREE') {
        this.scene?.setWindowLights([{ nx: 0.5, ny: 0.58, intensity: 0.85, color: accent }]);
        return;
      }
      const focused = wins.find((w) => w.focused && !w.minimized && w.workspace === this.ws.active());
      this.scene?.setWindowLights(
        focused
          ? [
              {
                nx: (focused.x + focused.w / 2) / window.innerWidth,
                ny: (focused.y + focused.h / 2) / window.innerHeight,
                intensity: 0.55,
                color: accent,
              },
            ]
          : [],
      );
    });
    // Play the open "map" animation on any window that's new this tick (and keep
    // the known-id set pruned). Coalesced: a batch of opens animates together.
    effect(() => {
      const wins = this.store.windows();
      const fresh = wins.filter((w) => !this.knownWins.has(w.id)).map((w) => w.id);
      this.knownWins = new Set(wins.map((w) => w.id));
      if (this.viewReady && fresh.length) {
        requestAnimationFrame(() => fresh.forEach((id) => this.effects.animateOpen(id)));
      }
    });
    // Theme → WebGL: morph the world's palette when the theme changes.
    effect(() => {
      const p = this.themes.scenePalette();
      if (this.viewReady) this.scene?.setPalette(p);
    });
    // Quality override from the Control Center.
    effect(() => {
      const q = this.settings.quality();
      if (this.viewReady) this.scene?.setQuality(q);
    });
    // Windows light the world: project the focused window's center + accent
    // onto the WebGL floor grid. Reads window geometry signals, so the light
    // tracks live during drags. (CSS never blooms; WebGL reacts to CSS state —
    // the compositor wall holds.)
    effect(() => {
      const wins = this.store.windows();
      if (!this.viewReady) return;
      const focused = wins.find((w) => w.focused && !w.minimized && w.workspace === this.ws.active());
      if (!focused) {
        this.scene?.setWindowLights([]);
        return;
      }
      const accent =
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00c8ff';
      this.scene?.setWindowLights([
        {
          nx: (focused.x + focused.w / 2) / Math.max(1, window.innerWidth),
          ny: (focused.y + focused.h / 2) / Math.max(1, window.innerHeight),
          intensity: 0.5,
          color: accent,
        },
      ]);
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

  /** In Expo, clicking a workspace thumbnail folds back to it. In Free-Look,
   *  clicking a face (without dragging) dives into it. */
  onFaceClick(face: number): void {
    if (this.ws.mode() === 'EXPO') this.ws.expoSelect(face);
    else if (this.ws.mode() === 'FREE' && !this.freeDragMoved) this.exitFreeLook(face);
  }

  // ---- Free-Look (the held floating cube) -------------------------------
  private freeDragMoved = false;

  enterFreeLook(): void {
    this.cubeProj.enterFree(this.ws.active());
    this.ws.mode.set('FREE');
  }

  /** Snap out into `face` (or whatever face is nearest the camera). */
  exitFreeLook(face?: number): void {
    const target = face ?? this.cubeProj.nearestFreeFace();
    this.cubeProj.exitFree(target, () => {
      this.ws.active.set(target);
      this.ws.mode.set('CUBE');
    });
  }

  /** Grab-and-steer: horizontal drag rotates, vertical drag tilts. */
  onFacePointerDown(_face: number, e: PointerEvent): void {
    if (this.ws.mode() !== 'FREE') return;
    e.preventDefault();
    this.freeDragMoved = false;
    let lastX = e.clientX;
    let lastY = e.clientY;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.freeDragMoved = true;
      this.cubeProj.rotateFree(dx * 0.35);
      this.cubeProj.tiltFree(-dy * 0.18);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // let the click handler read freeDragMoved, then reset it
      setTimeout(() => (this.freeDragMoved = false), 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** Scroll = zoom; zooming in far enough dives into the nearest face. */
  @HostListener('window:wheel', ['$event'])
  onWheel(e: WheelEvent): void {
    if (this.ws.mode() !== 'FREE') return;
    e.preventDefault();
    const scale = this.cubeProj.zoomFree(e.deltaY < 0 ? 0.06 : -0.06);
    if (scale >= FREE_SNAP_SCALE) this.exitFreeLook();
  }

  /**
   * Window transform: wobble skew always; during a cube spin, also push the
   * window off its face on the Z-axis (Compiz "3D Windows" pop-out), staggered
   * by stacking order so overlapping windows separate in depth. Position stays
   * on left/top so the genie/fire transforms (which assume that) keep working.
   */
  winTransform(w: Win): string {
    const skew = `skewX(${w.skewX}deg) skewY(${w.skewY}deg)`;
    if (this.ws.spin() || this.ws.mode() === 'FREE') {
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
    this.cubeProj.setFlat(this.ws.active());

    // Boot layout: replay the saved session, or seed the demo layout on a
    // fresh profile (the seed path is what the smoke harness asserts on).
    void this.persist
      .restoreOrSeed(() => this.seedDefaultLayout())
      .then(() => this.cubeProj.setFlat(this.ws.active()));

    installBlissApi({
      store: this.store,
      ws: this.ws,
      pv: this.pv,
      themes: this.themes,
      minimize: (w) => this.minimize(w),
      toggleMaximize: (w) => this.toggleMaximize(w),
      fireClose: (w) => this.fireClose(w),
      genieSize: () => this.genieMgr.size,
      altTab: () => {
        this.switcher?.advance();
        this.switcher?.commit();
      },
      notify: (glyph, title, body) => this.notif.show(glyph, title, body),
      freeLook: () => this.ws.requestFreeLook(),
      freeRotate: (deg) => this.cubeProj.rotateFree(deg),
      setHead: (x, y, depth) => this.headTrack.injectHead(x, y, depth),
      headState: () => ({ ...this.headTrack.status(), head: this.headTrack.head() }),
    });
  }

  /** The demo layout: 6 cyberpunk apps across the 4 cube faces. */
  private seedDefaultLayout(): void {
    seedDemoLayout(this.store);
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

  minimize(w: Win): void {
    this.sound.genie(false);
    this.genieMgr.minimize(w);
  }

  fireClose(w: Win): void {
    this.sound.fireClose();
    this.effects.fireClose(w);
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    // Ctrl/Cmd+K — the command palette.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.palette?.toggle();
      return;
    }
    // Ctrl+Tab — the cinematic window switcher (Alt/Cmd-Tab are OS-reserved).
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      this.switcher?.advance(e.shiftKey ? -1 : 1);
      return;
    }
    // Free-Look steering: arrows rotate the held cube, Esc/Enter snap out.
    if (this.ws.mode() === 'FREE') {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        this.cubeProj.rotateFree(e.key === 'ArrowLeft' ? 90 : -90);
        return;
      }
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        this.exitFreeLook();
        return;
      }
    }
    if (e.key === 'Escape') {
      if (this.switcher?.open()) {
        e.preventDefault();
        this.switcher.cancel();
        return;
      }
      if (this.cm.menu()) {
        e.preventDefault();
        this.cm.close();
        return;
      }
      if (this.ws.mode() === 'EXPO') {
        e.preventDefault();
        this.ws.mode.set('CUBE');
        return;
      }
    }
    if (e.ctrlKey && (e.altKey || e.shiftKey)) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.ws.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.ws.prev();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.ws.toggleExpo();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.ws.requestFreeLook(); // hold the cube (Compiz Ctrl+Alt+drag)
      }
    }
  }

  /** Releasing Ctrl commits the switcher selection (classic alt-tab). */
  @HostListener('window:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Control' && this.switcher?.open()) this.switcher.commit();
  }

  /** Titlebar right-click → window management menu. */
  onTitlebarMenu(w: Win, e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const workH = window.innerHeight - PANEL_H;
    const items: MenuItem[] = [
      { label: 'Minimize', glyph: '─', action: () => this.minimize(w) },
      {
        label: w.maximized ? 'Restore size' : 'Maximize',
        glyph: '▢',
        action: () => this.toggleMaximize(w),
      },
      {
        label: 'Snap left',
        glyph: '◧',
        action: () =>
          this.store.snapTo(w.id, { x: 0, y: PANEL_H, w: Math.floor(window.innerWidth / 2), h: workH }),
      },
      {
        label: 'Snap right',
        glyph: '◨',
        action: () =>
          this.store.snapTo(w.id, {
            x: Math.ceil(window.innerWidth / 2),
            y: PANEL_H,
            w: Math.floor(window.innerWidth / 2),
            h: workH,
          }),
      },
      {
        label: w.pinned ? 'Unpin from top' : 'Always on top',
        glyph: '📌',
        action: () => this.store.togglePin(w.id),
      },
      { separator: true, label: '' },
      ...this.workspaceList
        .filter((i) => i !== w.workspace)
        .map((i) => ({
          label: `Move to workspace ${i + 1}`,
          glyph: '◻',
          action: () => this.store.moveToWorkspace(w.id, i),
        })),
      { separator: true, label: '' },
      { label: 'Close', glyph: '✕', danger: true, action: () => this.fireClose(w) },
    ];
    this.cm.openAt(e.clientX, e.clientY, items);
  }

  /** Desktop (empty face) right-click → shell menu. */
  onDesktopMenu(e: MouseEvent): void {
    if ((e.target as Element).closest('.window')) return; // windows have their own
    if (this.ws.mode() === 'EXPO') return;
    e.preventDefault();
    this.cm.openAt(e.clientX, e.clientY, [
      { label: 'New Terminal', glyph: '🖥️', action: () => this.store.open('system-terminal') },
      { label: 'File Explorer', glyph: '📁', action: () => this.store.open('file-explorer') },
      { label: 'Notepad', glyph: '📝', action: () => this.store.open('notepad') },
      { separator: true, label: '' },
      { label: 'Toggle Expo overview', glyph: '▦', action: () => this.ws.toggleExpo() },
      { label: 'Control Center', glyph: '⚙️', action: () => this.store.open('settings') },
    ]);
  }

  runMenu(item: MenuItem): void {
    this.cm.close();
    item.action?.();
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.drag.dispose();
    this.genieMgr.dispose();
    this.scene?.dispose();
  }
}
