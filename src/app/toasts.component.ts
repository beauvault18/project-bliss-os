import { Component, inject } from '@angular/core';
import { NotificationService } from '../ng/notification.service';

/** The toast stack — glass cards flying in under the Tube panel. */
@Component({
  selector: 'app-toasts',
  standalone: true,
  template: `
    <div class="toasts" aria-live="polite">
      @for (t of notif.toasts(); track t.id) {
        <div
          class="toast"
          [class.toast--leaving]="t.leaving"
          data-testid="toast"
          (click)="notif.dismiss(t.id)"
        >
          <span class="toast__glyph">{{ t.glyph }}</span>
          <div class="toast__text">
            <div class="toast__title">{{ t.title }}</div>
            @if (t.body) {
              <div class="toast__body">{{ t.body }}</div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class ToastsComponent {
  readonly notif = inject(NotificationService);
}
