import {
  AfterViewInit,
  Component,
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
import { WorkspaceStore, WORKSPACE_COUNT, type CubeSpin } from '../ng/workspace-store';
import { WindowBodyDirective } from './window-body.directive';
import { TaskbarComponent } from './taskbar.component';

const SPIN_MS = 950;

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
      <div class="cube-viewport" [class.cube-viewport--spin]="!!ws.spin()">
        <div class="cube" #cube>
          @for (f of workspaceList; track f) {
            <div
              class="cube-face"
              [class.cube-face--active]="f === ws.active()"
              [attr.data-ws]="f"
              [style.transform]="faceTransform(f)"
            >
              @for (w of windowsOn(f); track w.id) {
                <div
                  class="window"
                  [class.window--focused]="w.focused"
                  [style.left.px]="w.x"
                  [style.top.px]="w.y"
                  [style.width.px]="w.w"
                  [style.height.px]="w.h"
                  [style.zIndex]="w.z"
                  data-testid="window"
                  [attr.data-appid]="w.appId"
                  [attr.data-ws]="w.workspace"
                  (pointerdown)="store.focus(w.id)"
                >
                  <div
                    class="titlebar titlebar--right"
                    data-testid="titlebar"
                    (pointerdown)="startDrag(w, $event)"
                  >
                    <span class="titlebar__name">
                      <span class="titlebar__icon">{{ w.icon }}</span>
                      {{ w.title }}
                    </span>
                    <button
                      class="rapid-btn"
                      data-testid="win-close"
                      title="Close"
                      (pointerdown)="$event.stopPropagation()"
                      (click)="store.close(w.id)"
                    >
                      ✕
                    </button>
                  </div>
                  <div class="window__body">
                    <ng-container [appWindowBody]="w.appId" />
                  </div>
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
  readonly workspaceList = Array.from({ length: WORKSPACE_COUNT }, (_, i) => i);
  readonly edge = signal(window.innerWidth);

  @ViewChild('bg') private bg!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cube') private cube?: ElementRef<HTMLElement>;
  private scene?: DesktopScene;
  private viewReady = false;
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
  }

  windowsOn(face: number): Win[] {
    return this.store.windows().filter((w) => w.workspace === face);
  }

  /** A face's fixed position on the cube (one quarter-turn apart). */
  faceTransform(face: number): string {
    return `rotateY(${face * 90}deg) translateZ(${this.edge() / 2}px)`;
  }

  ngAfterViewInit(): void {
    this.scene = new DesktopScene(this.bg.nativeElement);
    this.scene.start();
    window.addEventListener('resize', this.onResize);
    this.viewReady = true;
    this.setFlat(this.ws.active());

    this.store.open('notepad');
    this.store.open('calculator');

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
    };
  }

  /** Rest pose: active face square-on at z=0 (looks like a flat desktop). */
  private setFlat(face: number): void {
    const el = this.cube?.nativeElement;
    if (!el) return;
    el.style.transform = `translateZ(${-this.edge() / 2}px) rotateY(${-face * 90}deg)`;
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
    const anim = el.animate(
      [
        { transform: `translateZ(${-d}px) rotateY(${fromA}deg)` },
        {
          transform: `scale(0.62) rotateX(-12deg) translateZ(${-d}px) rotateY(${midA}deg)`,
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
    if (this.ws.spin()) return; // no dragging mid-rotation
    this.store.focus(w.id);
    const offX = e.clientX - w.x;
    const offY = e.clientY - w.y;
    const move = (ev: PointerEvent) => this.store.move(w.id, ev.clientX - offX, ev.clientY - offY);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.ctrlKey && (e.altKey || e.shiftKey)) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.ws.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.ws.prev();
      }
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.scene?.dispose();
  }
}
