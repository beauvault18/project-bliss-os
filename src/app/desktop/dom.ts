/** Shared DOM helpers for the desktop's animation systems. */

/** The live DOM node for a window id — the [data-winid] hook is the contract
 *  between the store's records and the imperative WAAPI animations. */
export const windowEl = (id: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-winid="${id}"]`);

export const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));
