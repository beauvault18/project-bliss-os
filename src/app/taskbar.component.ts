import { Component, computed, inject, signal } from '@angular/core';
import { APPS } from '../ng/app-registry';
import { WindowStore, type Win } from '../ng/window-store';
import { WorkspaceStore, WORKSPACE_COUNT } from '../ng/workspace-store';
import { HeadTrackingService } from '../ng/head-tracking.service';

/**
 * Compiz/MATE-style "Tube" panel: a full-width glass shell at the top with an
 * Applications menu (off the app registry), a left-aligned window list, and a
 * system tray (overview toggle, workspace pips, clock).
 */
@Component({
  selector: 'app-taskbar',
  standalone: true,
  template: `
    <div class="taskbar">
      <button class="menu-btn" data-testid="start-button" (click)="toggleMenu()">
        <span class="menu-btn__logo" aria-hidden>◈</span>
        Applications
      </button>

      <div class="task-list">
        @for (w of store.windows(); track w.id) {
          <button
            class="task"
            [class.task--active]="w.focused"
            [class.task--minimized]="w.minimized"
            data-testid="task-button"
            [attr.data-appid]="w.appId"
            [attr.data-taskwin]="w.id"
            (click)="onTask(w)"
            (mouseenter)="peekStart(w)"
            (mouseleave)="peekEnd()"
          >
            <span class="task__icon" aria-hidden>{{ w.icon }}</span>
            <span class="task__label">{{ w.title }}</span>
            <span
              class="task__close"
              data-testid="task-close"
              title="Close"
              (click)="closeTask(w, $event)"
            >✕</span>
          </button>
        }
      </div>

      <div class="tray">
        @if (headTrack.active()) {
          <span class="cam-dot" title="Head tracking active — camera on (Control Center to disable)">📷</span>
        }
        <button
          class="ws-pip ws-pip--expo"
          [class.ws-pip--active]="ws.mode() === 'FREE'"
          data-testid="free-toggle"
          title="Hold the cube (Ctrl+Alt+Down)"
          (click)="ws.requestFreeLook()"
        >
          ◳
        </button>
        <button
          class="ws-pip ws-pip--expo"
          [class.ws-pip--active]="ws.mode() === 'EXPO'"
          data-testid="expo-toggle"
          title="Overview (Ctrl+Alt+Up)"
          (click)="ws.toggleExpo()"
        >
          ▦
        </button>
        <div class="ws-indicator" data-testid="workspace-indicator">
          @for (i of workspaceList; track i) {
            <button
              class="ws-pip"
              [class.ws-pip--active]="i === ws.active()"
              data-testid="workspace-pip"
              [attr.data-ws]="i"
              [title]="'Workspace ' + (i + 1)"
              (click)="ws.switchTo(i)"
            >
              {{ i + 1 }}
              @if (occupied(i)) {
                <span class="ws-pip__dot" aria-hidden></span>
              }
            </button>
          }
        </div>
        <span class="clock" data-testid="clock">{{ clock() }}</span>
      </div>
    </div>

    @if (menuOpen()) {
      <div class="apps-scrim" (click)="menuOpen.set(false)"></div>
    }
    <!-- Always in the DOM (CSS-hidden when closed) so launchers stay queryable. -->
    <div class="apps-menu" [class.apps-menu--open]="menuOpen()">
      @for (a of apps; track a.id) {
        <button
          class="apps-menu__item"
          data-testid="launcher"
          [attr.data-appid]="a.id"
          (click)="launch(a.id)"
        >
          <span class="apps-menu__icon" aria-hidden>{{ a.icon }}</span>
          {{ a.title }}
        </button>
      }
    </div>
  `,
})
export class TaskbarComponent {
  readonly store = inject(WindowStore);
  readonly ws = inject(WorkspaceStore);
  readonly headTrack = inject(HeadTrackingService);
  readonly apps = APPS;
  readonly workspaceList = Array.from({ length: WORKSPACE_COUNT }, (_, i) => i);
  readonly menuOpen = signal(false);

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  /** Open (or focus) an app from the Applications menu, then close the menu. */
  launch(id: string): void {
    this.store.openOrFocus(id);
    this.menuOpen.set(false);
  }

  /** Click a task: restore it if minimized (reverse-genie), else focus it. */
  onTask(w: Win): void {
    if (w.minimized) this.store.requestRestore(w.id);
    else this.store.focus(w.id);
  }

  /** The task's ✕: close even when minimized (no titlebar reachable then). */
  closeTask(w: Win, e: Event): void {
    e.stopPropagation();
    this.store.close(w.id);
  }

  occupied(i: number): boolean {
    return this.store.windows().some((w) => w.workspace === i);
  }

  /** Taskbar peek: after a 350 ms hover, dim every other window on the face
   *  so the hovered task's window stands out (opacity/filter only — never
   *  transform, which the skew binding owns). */
  private peekTimer?: ReturnType<typeof setTimeout>;
  peekStart(w: Win): void {
    clearTimeout(this.peekTimer);
    this.peekTimer = setTimeout(() => this.store.peekId.set(w.id), 350);
  }
  peekEnd(): void {
    clearTimeout(this.peekTimer);
    this.store.peekId.set(null);
  }
  readonly clock = computed(() => {
    const d = new Date();
    return `${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
}
