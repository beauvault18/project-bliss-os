import type { WindowState } from './types';

const SNAP_THRESHOLD = 18; // px
const TASKBAR_H = 40;

/**
 * Given a window's proposed top-left position, return a magnetically snapped
 * position when near screen edges, other windows, or the screen center seam.
 */
export function magneticSnap(
  win: { x: number; y: number; w: number; h: number },
  others: WindowState[],
  viewport: { w: number; h: number },
): { x: number; y: number } {
  let { x, y } = win;
  const right = x + win.w;
  const bottom = y + win.h;
  const screenBottom = viewport.h - TASKBAR_H;

  // Screen edges.
  if (Math.abs(x) < SNAP_THRESHOLD) x = 0;
  if (Math.abs(viewport.w - right) < SNAP_THRESHOLD) x = viewport.w - win.w;
  if (Math.abs(y) < SNAP_THRESHOLD) y = 0;
  if (Math.abs(screenBottom - bottom) < SNAP_THRESHOLD) y = screenBottom - win.h;

  // Edge-to-edge with other windows (left-to-right and right-to-left).
  for (const o of others) {
    if (o.minimized) continue;
    if (Math.abs(x - (o.x + o.w)) < SNAP_THRESHOLD) x = o.x + o.w;
    if (Math.abs(x + win.w - o.x) < SNAP_THRESHOLD) x = o.x - win.w;
    if (Math.abs(y - (o.y + o.h)) < SNAP_THRESHOLD) y = o.y + o.h;
    if (Math.abs(y + win.h - o.y) < SNAP_THRESHOLD) y = o.y - win.h;
  }

  return { x, y };
}
