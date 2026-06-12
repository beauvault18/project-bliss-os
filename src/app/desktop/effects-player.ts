import type { WindowStore, Win } from '../../ng/window-store';
import { windowEl } from './dom';
import { ms } from '../../ng/motion';

/** Fire close: incinerate-and-drift-up duration + accelerating ease. */
const FIRE_MS = 600;
const FIRE_EASING = 'cubic-bezier(0.55, 0.055, 0.675, 0.19)';
/** Window-open "map" animation: zoom-in with a slight overshoot. */
const OPEN_MS = 320;
const OPEN_EASING = 'cubic-bezier(0.2, 0.9, 0.3, 1.25)';

/**
 * One-shot WAAPI window effects: the open "map" zoom and the fire-close
 * incineration. Both are imperative keyframe effects that borrow the window's
 * transform/filter for their duration; open uses NO fill so the transform
 * reverts cleanly to the reactive skew binding on finish, and fire holds its
 * final frame only until the store removes the window in onfinish.
 */
export class EffectsPlayer {
  constructor(private store: WindowStore) {}

  /** Window "map" animation: zoom in from small + transparent with a slight
   *  overshoot. No fill, so the transform reverts to winTransform on finish. */
  animateOpen(id: string): void {
    const el = windowEl(id);
    if (!el) return;
    el.animate(
      [
        { transform: 'scale(0.72)', opacity: 0, offset: 0 },
        { transform: 'scale(1.04)', opacity: 1, offset: 0.72 },
        { transform: 'scale(1)', opacity: 1, offset: 1 },
      ],
      { duration: ms(OPEN_MS), easing: OPEN_EASING },
    );
  }

  /**
   * Fire close: incinerate the window — flash hot, tint to ember orange/red via
   * filters, blur and drift upward as it burns away — then remove it for real on
   * finish. The window stays in the @for (locked, non-interactive) until the
   * animation completes so the burn is visible.
   */
  fireClose(w: Win): void {
    const el = windowEl(w.id);
    if (!el) {
      this.store.close(w.id); // off-face / no node → nothing to burn
      return;
    }
    this.store.setClosing(w.id);
    const anim = el.animate(
      [
        {
          transform: 'translateY(0px) scale(1)',
          filter: 'brightness(1) contrast(1) blur(0px) sepia(0) hue-rotate(0deg) saturate(1)',
          opacity: 1,
          offset: 0,
        },
        {
          transform: 'translateY(-20px) scale(1.02)',
          filter: 'brightness(1.5) contrast(1.2) blur(2px) sepia(1) hue-rotate(-10deg) saturate(3)',
          opacity: 0.9,
          offset: 0.3,
        },
        {
          transform: 'translateY(-80px) scale(0.8) skewX(5deg)',
          filter: 'brightness(0.5) contrast(2) blur(12px) sepia(1) hue-rotate(-30deg) saturate(5)',
          opacity: 0,
          offset: 1,
        },
      ],
      { duration: ms(FIRE_MS), easing: FIRE_EASING, fill: 'forwards' },
    );
    anim.onfinish = () => this.store.close(w.id);
  }
}
