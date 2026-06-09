import { Component, computed, inject } from '@angular/core';
import { APPS } from '../ng/app-registry';
import { WindowStore } from '../ng/window-store';
import { WorkspaceStore, WORKSPACE_COUNT } from '../ng/workspace-store';

/** XP-style taskbar: Start button, one button per open window, and a clock. */
@Component({
  selector: 'app-taskbar',
  standalone: true,
  template: `
    <div class="taskbar">
      <button class="start-button" data-testid="start-button">
        <span class="start-button__logo" aria-hidden>⊞</span>
        start
      </button>
      <div class="taskbar__tasks">
        @for (w of store.windows(); track w.id) {
          <button
            class="task"
            [class.task--active]="w.focused"
            data-testid="task-button"
            [attr.data-appid]="w.appId"
            (click)="store.focus(w.id)"
          >
            <span aria-hidden>{{ w.icon }}</span>
            <span class="task__label">{{ w.title }}</span>
          </button>
        }
      </div>
      <div class="taskbar__launchers">
        @for (a of apps; track a.id) {
          <button
            class="task"
            data-testid="launcher"
            [attr.data-appid]="a.id"
            [title]="a.title"
            (click)="store.openOrFocus(a.id)"
          >
            <span aria-hidden>{{ a.icon }}</span>
          </button>
        }
      </div>
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
      <div class="systray"><span class="clock" data-testid="clock">{{ clock() }}</span></div>
    </div>
  `,
})
export class TaskbarComponent {
  readonly store = inject(WindowStore);
  readonly ws = inject(WorkspaceStore);
  readonly apps = APPS;
  readonly workspaceList = Array.from({ length: WORKSPACE_COUNT }, (_, i) => i);

  occupied(i: number): boolean {
    return this.store.windows().some((w) => w.workspace === i);
  }
  readonly clock = computed(() => {
    const d = new Date();
    return `${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
}
