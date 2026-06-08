import type { WindowState } from './types';

const TASKBAR_H = 40;

/**
 * Given a window's proposed top-left position, return a magnetically snapped
 * position when near screen edges or other windows. `threshold` (px) is the
 * magnet range — 0 disables snapping (driven by the Bliss Lab snap strength).
 */
export function magneticSnap(
  win: { x: number; y: number; w: number; h: number },
  others: WindowState[],
  viewport: { w: number; h: number },
  threshold = 18,
): { x: number; y: number } {
  let { x, y } = win;
  if (threshold <= 0) return { x, y };
  const right = x + win.w;
  const bottom = y + win.h;
  const screenBottom = viewport.h - TASKBAR_H;

  // Screen edges.
  if (Math.abs(x) < threshold) x = 0;
  if (Math.abs(viewport.w - right) < threshold) x = viewport.w - win.w;
  if (Math.abs(y) < threshold) y = 0;
  if (Math.abs(screenBottom - bottom) < threshold) y = screenBottom - win.h;

  // Edge-to-edge with other windows (left-to-right and right-to-left).
  for (const o of others) {
    if (o.minimized) continue;
    if (Math.abs(x - (o.x + o.w)) < threshold) x = o.x + o.w;
    if (Math.abs(x + win.w - o.x) < threshold) x = o.x - win.w;
    if (Math.abs(y - (o.y + o.h)) < threshold) y = o.y + o.h;
    if (Math.abs(y + win.h - o.y) < threshold) y = o.y - win.h;
  }

  return { x, y };
}
