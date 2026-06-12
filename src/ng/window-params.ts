import { InjectionToken } from '@angular/core';

/**
 * Per-window launch parameters, provided to each app component by
 * WindowBodyDirective through the same child injector as WINDOW_VISIBLE.
 * This is how apps pass data to each other at open time — e.g. File Explorer
 * launching Notepad on a file: store.open('notepad', { params: { path } }).
 * Defaults to an empty object so apps rendered in isolation still work.
 */
export const WINDOW_PARAMS = new InjectionToken<Record<string, unknown>>('WINDOW_PARAMS', {
  factory: () => ({}),
});
