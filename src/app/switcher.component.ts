import { Component, computed, inject, signal } from '@angular/core';
import { WindowStore, type Win } from '../ng/window-store';
import { WorkspaceStore } from '../ng/workspace-store';

/**
 * The cinematic window switcher (Ctrl+Tab): holographic cards fanned in 3D —
 * the selected card flat and lit, neighbors rotated away and dimmed — cycling
 * in MRU order (store z). Committing focuses the window, restores it if
 * minimized, and rides the existing cube spin when it lives on another face
 * (the cross-workspace switch IS the cinematic payoff).
 *
 * Card-based by design: live DOM thumbnails would require re-parenting
 * windows out of their cube faces, breaking the @for reconciliation and the
 * genie's element cache.
 */
@Component({
  selector: 'app-switcher',
  standalone: true,
  template: `
    @if (open()) {
      <div class="switcher" aria-label="window switcher">
        <div class="switcher__rail">
          @for (w of mru(); track w.id; let i = $index) {
            <div
              class="switcher__card"
              [class.switcher__card--sel]="i === index()"
              [style.transform]="cardTransform(i)"
              [style.zIndex]="100 - abs(i - index())"
              data-testid="switcher-card"
              (click)="select(i)"
            >
              <span class="switcher__icon">{{ w.icon }}</span>
              <span class="switcher__title">{{ w.title }}</span>
              <span class="switcher__ws">WS {{ w.workspace + 1 }}{{ w.minimized ? ' · min' : '' }}</span>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class SwitcherComponent {
  private store = inject(WindowStore);
  private ws = inject(WorkspaceStore);

  readonly open = signal(false);
  readonly index = signal(0);
  /** MRU order = stacking order, frozen at open time so cards don't reshuffle
   *  mid-cycle. */
  private frozen = signal<Win[]>([]);
  readonly mru = computed(() => this.frozen());

  readonly abs = Math.abs;

  /** Open (frozen MRU, selection starts at the SECOND entry — classic
   *  alt-tab semantics) or advance the selection. */
  advance(dir = 1): void {
    if (!this.open()) {
      const list = [...this.store.windows()].sort((a, b) => b.z - a.z);
      if (list.length < 2) return;
      this.frozen.set(list);
      this.index.set(1 % list.length);
      this.open.set(true);
      return;
    }
    const n = this.frozen().length;
    this.index.set((this.index() + dir + n) % n);
  }

  /** Commit the current selection. */
  commit(): void {
    if (!this.open()) return;
    const w = this.frozen()[this.index()];
    this.open.set(false);
    if (!w) return;
    const live = this.store.windows().find((x) => x.id === w.id);
    if (!live) return;
    if (live.minimized) this.store.requestRestore(live.id);
    this.store.focus(live.id);
    if (live.workspace !== this.ws.active()) this.ws.switchTo(live.workspace); // ride the cube spin
  }

  cancel(): void {
    this.open.set(false);
  }

  select(i: number): void {
    this.index.set(i);
    this.commit();
  }

  /** Coverflow fan: selected card flat at center, neighbors swept back. */
  cardTransform(i: number): string {
    const d = i - this.index();
    const x = d * 150;
    const rot = d === 0 ? 0 : d > 0 ? -38 : 38;
    const z = d === 0 ? 0 : -160 - Math.abs(d) * 30;
    return `translateX(${x}px) translateZ(${z}px) rotateY(${rot}deg)`;
  }
}
