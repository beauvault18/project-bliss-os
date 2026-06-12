/** Tiny input guards shared by every IPC handler. Handlers coerce/validate at
 *  the boundary so a compromised renderer can't smuggle surprising payloads. */

export const isString = (v: unknown): v is string => typeof v === 'string';

export const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Clamp a number into [lo, hi], coercing non-numbers to `lo`. */
export const bounded = (v: unknown, lo: number, hi: number): number =>
  isFiniteNumber(v) ? Math.max(lo, Math.min(hi, v)) : lo;
