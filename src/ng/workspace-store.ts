import { Injectable, signal } from '@angular/core';

/** Number of virtual desktops (cube faces). */
export const WORKSPACE_COUNT = 4;

/** Cosmetic cube transition, set while a rotation is playing. */
export interface CubeSpin {
  from: number;
  to: number;
}

/**
 * The virtual-desktop manager. `active` is the source of truth for which
 * windows are visible; `spin` drives the cube rotation overlay (R1b). Switching
 * only changes VISIBILITY — windows are never created, moved, or destroyed.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  readonly active = signal(0);
  readonly spin = signal<CubeSpin | null>(null);

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

  endSpin(): void {
    this.spin.set(null);
  }
}
