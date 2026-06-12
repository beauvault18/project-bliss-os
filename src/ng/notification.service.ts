import { inject, Injectable, signal } from '@angular/core';
import { SoundService } from './sound.service';

export interface Toast {
  id: number;
  glyph: string;
  title: string;
  body?: string;
  leaving?: boolean;
}

const TOAST_MS = 4200;

/** Shell notifications: a small stack of glass toasts under the panel. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly toasts = signal<Toast[]>([]);
  private sound = inject(SoundService);
  private seq = 0;

  show(glyph: string, title: string, body?: string): void {
    const id = ++this.seq;
    this.toasts.update((ts) => [...ts.slice(-3), { id, glyph, title, body }]);
    this.sound.notify();
    setTimeout(() => this.dismiss(id), TOAST_MS);
  }

  dismiss(id: number): void {
    // Mark leaving (plays the exit animation), then remove.
    this.toasts.update((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(
      () => this.toasts.update((ts) => ts.filter((t) => t.id !== id)),
      220,
    );
  }
}
