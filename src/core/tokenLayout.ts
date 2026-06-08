// Shared layout for "somersault token" minimized-window tokens on the desktop.

export const TOKEN_W = 134;
export const TOKEN_H = 58;
const GAP = 12;
const MARGIN = 20;
const TASKBAR_H = 40;
const BOTTOM_GAP = 14;

/** Screen position of the Nth token (row-wrapping along the bottom). */
export function tokenSlotPosition(
  slot: number,
  viewport: { w: number; h: number },
): { x: number; y: number } {
  const perRow = Math.max(
    1,
    Math.floor((viewport.w - MARGIN * 2) / (TOKEN_W + GAP)),
  );
  const row = Math.floor(slot / perRow);
  const col = slot % perRow;
  const x = MARGIN + col * (TOKEN_W + GAP);
  const y =
    viewport.h - TASKBAR_H - TOKEN_H - BOTTOM_GAP - row * (TOKEN_H + GAP);
  return { x, y };
}
