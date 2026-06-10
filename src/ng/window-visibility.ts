import { Injectable, InjectionToken, signal, type Signal } from '@angular/core';

/**
 * Per-window "am I visible?" signal, provided to each app component by
 * {@link WindowBodyDirective} via a child injector. Apps read it to skip their
 * expensive RAF/interval work when their window is on a hidden cube face,
 * minimized, or the whole app is backgrounded. Defaults to always-visible so an
 * app rendered outside the desktop (e.g. in isolation) still animates.
 */
export const WINDOW_VISIBLE = new InjectionToken<Signal<boolean>>('WINDOW_VISIBLE', {
  factory: () => signal(true),
});

/**
 * Single source of truth for "is the app window backgrounded". Mirrors the
 * Page Visibility API into a signal so both the per-window gate and the WebGL
 * scene can pause when the Electron window is hidden/minimized.
 */
@Injectable({ providedIn: 'root' })
export class PageVisibilityService {
  readonly hidden = signal(typeof document !== 'undefined' ? document.hidden : false);

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => this.hidden.set(document.hidden));
    }
  }
}
