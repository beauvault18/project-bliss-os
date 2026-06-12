import type { WindowStore, Win } from '../../ng/window-store';
import { windowEl } from './dom';
import { ms } from '../../ng/motion';

/** Genie minimize: duration + snappy deceleration toward the taskbar. */
const GENIE_MS = 450;
const GENIE_EASING = 'cubic-bezier(0.25, 1, 0.5, 1)';

/**
 * Owns the genie minimize/restore lifecycle. The forward animation is held
 * (fill: forwards) so the window stays collapsed while minimized; the geometry
 * deltas and the held Animation are cached per window id so restore can play
 * the exact reverse. The map is purged (by the desktop's effect) for any
 * window that leaves the store, so a minimize-then-close can never orphan a
 * held Animation.
 */
export class GenieManager {
  /** Cached genie geometry + held forward animation, per minimized window. */
  private genie = new Map<string, { dx: number; dy: number; anim: Animation }>();

  constructor(private store: WindowStore) {}

  /**
   * Genie minimize: suck the window down into its taskbar button — squeeze
   * horizontally, stretch vertically, then collapse into the icon.
   */
  minimize(w: Win): void {
    const el = windowEl(w.id);
    const targetEl = document.querySelector<HTMLElement>(`[data-taskwin="${w.id}"]`);
    if (!el || !targetEl) {
      this.store.setMinimized(w.id, true); // can't animate (off-face) → just hide
      return;
    }
    const wr = el.getBoundingClientRect();
    const ir = targetEl.getBoundingClientRect();
    const dx = ir.left + ir.width / 2 - (wr.left + wr.width / 2);
    const dy = ir.top + ir.height / 2 - (wr.top + wr.height / 2);
    const anim = el.animate(this.genieFrames(dx, dy, false), {
      duration: ms(GENIE_MS),
      easing: GENIE_EASING,
      fill: 'forwards',
    });
    this.genie.set(w.id, { dx, dy, anim });
    anim.onfinish = () => this.store.setMinimized(w.id, true);
  }

  /** Reverse-genie: spring the window back out of the taskbar to full size. */
  restore(id: string): void {
    this.store.endRestore();
    const params = this.genie.get(id);
    const el = windowEl(id);
    this.store.setMinimized(id, false);
    if (!el || !params) return; // wasn't animated → already shown by the flag flip
    // Take over with the reverse animation BEFORE cancelling the held forward
    // one, so there's no full-size flash between the two.
    const rev = el.animate(this.genieFrames(params.dx, params.dy, true), {
      duration: ms(GENIE_MS),
      easing: GENIE_EASING,
      fill: 'forwards',
    });
    params.anim.cancel();
    this.genie.delete(id);
    rev.onfinish = () => rev.cancel(); // release transform back to the skew binding
  }

  /** Drop held animations for windows no longer in the store (leak guard). */
  purge(liveIds: Set<string>): void {
    for (const [id, g] of this.genie) {
      if (!liveIds.has(id)) {
        g.anim.cancel();
        this.genie.delete(id);
      }
    }
  }

  /** Held-animation count — exposed on __bliss for the smoke leak check. */
  get size(): number {
    return this.genie.size;
  }

  dispose(): void {
    for (const g of this.genie.values()) g.anim.cancel();
    this.genie.clear();
  }

  /** Genie keyframes from the window's center to a taskbar delta (or reversed). */
  private genieFrames(dx: number, dy: number, reverse: boolean): Keyframe[] {
    const frames: Keyframe[] = [
      { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, offset: 0 },
      {
        transform: `translate(${dx * 0.3}px, ${dy * 0.5}px) scale(0.6, 1.2)`,
        opacity: 0.85,
        offset: 0.4,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(0.01, 0.01)`, opacity: 0, offset: 1 },
    ];
    if (!reverse) return frames;
    return frames
      .map((f) => ({ ...f, offset: 1 - (f.offset as number) }))
      .reverse();
  }
}
