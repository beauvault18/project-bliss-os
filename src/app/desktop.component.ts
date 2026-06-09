import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { DesktopScene } from '../three/desktop-scene';
import { WindowStore, type Win } from '../ng/window-store';
import { WindowBodyDirective } from './window-body.directive';
import { TaskbarComponent } from './taskbar.component';

/**
 * Root of the pure-Angular Project Bliss OS. Layers, back to front:
 *   1. <canvas> — the Three.js WebGL desktop (gradient sky + starfield)
 *   2. window layer — windows rendered inline so their bindings react to the
 *      store signal; bodies hosted via appWindowBody
 *   3. taskbar
 *
 * Windows are inlined here (rather than a child component with inputs) because
 * the reactive position/focus bindings must live where `store.windows()` is
 * read, so zoneless change detection re-renders them on every store update.
 */
@Component({
  selector: 'app-desktop',
  standalone: true,
  imports: [WindowBodyDirective, TaskbarComponent],
  template: `
    <div class="desktop">
      <canvas #bg class="desktop-bg"></canvas>
      <div class="window-layer">
        @for (w of store.windows(); track w.id) {
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
      <app-taskbar />
    </div>
  `,
})
export class DesktopComponent implements AfterViewInit, OnDestroy {
  readonly store = inject(WindowStore);
  @ViewChild('bg') private bg!: ElementRef<HTMLCanvasElement>;
  private scene?: DesktopScene;
  private onResize = () => this.scene?.resize();

  ngAfterViewInit(): void {
    this.scene = new DesktopScene(this.bg.nativeElement);
    this.scene.start();
    window.addEventListener('resize', this.onResize);

    // Seed a couple of windows so the desktop isn't empty on first run.
    this.store.open('notepad');
    this.store.open('calculator');

    // Headless smoke / debug hook.
    (window as unknown as { __bliss: unknown }).__bliss = {
      open: (id: string) => this.store.open(id),
      openOrFocus: (id: string) => this.store.openOrFocus(id),
      close: (id: string) => this.store.close(id),
      focus: (id: string) => this.store.focus(id),
      windows: () => this.store.windows(),
    };
  }

  startDrag(w: Win, e: PointerEvent): void {
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

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.scene?.dispose();
  }
}
