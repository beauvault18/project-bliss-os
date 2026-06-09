import { Component, computed, inject } from '@angular/core';
import { APPS } from '../ng/app-registry';
import { WindowStore } from '../ng/window-store';

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
      <div class="systray"><span class="clock" data-testid="clock">{{ clock() }}</span></div>
    </div>
  `,
})
export class TaskbarComponent {
  readonly store = inject(WindowStore);
  readonly apps = APPS;
  readonly clock = computed(() => {
    const d = new Date();
    return `${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
}
