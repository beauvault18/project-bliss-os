import { Injectable, signal } from '@angular/core';

/** Number of virtual desktops (cube faces). */
export const WORKSPACE_COUNT = 4;

/** Cosmetic cube transition, set while a rotation is playing. */
export interface CubeSpin {
  from: number;
  to: number;
}

/** Desktop projection: the flat cube, the 2x2 Expo overview grid, or
 *  Free-Look — the held, steerable floating cube (Compiz Ctrl+Alt+drag). */
export type DesktopMode = 'CUBE' | 'EXPO' | 'FREE';

/**
 * The virtual-desktop manager. `active` is the source of truth for which
 * windows are visible; `spin` drives the cube rotation overlay (R1b). Switching
 * only changes VISIBILITY — windows are never created, moved, or destroyed.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  readonly active = signal(0);
  readonly spin = signal<CubeSpin | null>(null);
  /** Cube vs Expo overview. Flipping this re-projects the faces (no remount). */
  readonly mode = signal<DesktopMode>('CUBE');

  /** Enter/leave the Expo overview (ignored mid-spin / in Free-Look). */
  toggleExpo(): void {
    if (this.spin() || this.mode() === 'FREE') return;
    this.mode.update((m) => (m === 'CUBE' ? 'EXPO' : 'CUBE'));
  }

  /** Free-Look toggle request — a counter, not the mode itself: the desktop
   *  owns the eased enter/exit animations and flips `mode` when they land.
   *  Callable from the taskbar, the keyboard, and the __bliss test API. */
  readonly freeLookReq = signal(0);
  requestFreeLook(): void {
    if (this.spin() || this.mode() === 'EXPO') return;
    this.freeLookReq.update((n) => n + 1);
  }

  /** Pick a workspace from Expo and fold back to the cube (no spin). */
  expoSelect(index: number): void {
    if (index < 0 || index >= WORKSPACE_COUNT) return;
    this.active.set(index);
    this.mode.set('CUBE');
  }

  switchTo(index: number): void {
    const from = this.active();
    if (index === from || index < 0 || index >= WORKSPACE_COUNT) return;
    this.active.set(index);
    this.spin.set({ from, to: index });
  }

  next(): void {
    this.switchTo((this.active() + 1) % WORKSPACE_COUNT);
  }

  prev(): void {
    this.switchTo((this.active() + WORKSPACE_COUNT - 1) % WORKSPACE_COUNT);
  }

  /** Index of the workspace `dir` steps from the active one, wrapping 0..N-1
   *  (+1 = next/right, -1 = prev/left). Used by the edge-flip drag. */
  adjacent(dir: number): number {
    return (this.active() + dir + WORKSPACE_COUNT) % WORKSPACE_COUNT;
  }

  endSpin(): void {
    this.spin.set(null);
  }
}
