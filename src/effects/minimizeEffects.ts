import type { CSSProperties } from 'react';
import type { MinimizeGeometry, MinimizeStyle } from '../core/animationPresets';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Geometry for collapsing a window toward a target rect (its taskbar button).
 * dx/dy are the center-to-center delta in screen px; targetScale is how small
 * the window shrinks to; pointDown orients the genie "neck".
 */
export function computeGenieGeometry(win: Rect, target: Rect): MinimizeGeometry {
  const winCx = win.x + win.w / 2;
  const winCy = win.y + win.h / 2;
  const tgtCx = target.x + target.w / 2;
  const tgtCy = target.y + target.h / 2;
  const dx = tgtCx - winCx;
  const dy = tgtCy - winCy;
  const targetScale = Math.max(0.05, Math.min(0.2, (target.w || 90) / win.w));
  return { dx, dy, targetScale, pointDown: dy >= 0 };
}

/**
 * Fake Compiz/Mac "genie": translate+shrink toward the target, fade late, and
 * pinch a trapezoidal neck toward the taskbar. progress 1 = normal, 0 = collapsed.
 * CSS-only (no mesh deformation).
 */
export const genieStyle: MinimizeStyle = (progress, geo): CSSProperties => {
  const t = 1 - progress; // 0 = normal, 1 = fully collapsed
  const tx = geo.dx * t;
  const ty = geo.dy * t;
  const scale = lerp(1, geo.targetScale, t);
  const neck = t * 42; // % each side -> trapezoidal "neck"
  const clipPath =
    t <= 0.001
      ? 'none'
      : geo.pointDown
        ? `polygon(0% 0%, 100% 0%, ${100 - neck}% 100%, ${neck}% 100%)`
        : `polygon(${neck}% 0%, ${100 - neck}% 0%, 100% 100%, 0% 100%)`;

  return {
    transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
    transformOrigin: '50% 50%',
    opacity: lerp(1, 0.15, t),
    clipPath,
    borderRadius: `${lerp(8, 22, t)}px`,
    filter: 'none',
    willChange: 'transform, clip-path, opacity',
  };
};
