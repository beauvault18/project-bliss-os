/**
 * Global motion scale, consumed by every imperative animation system (cube
 * spin, genie, fire, open, expo). A plain module variable rather than DI so
 * the plain animation classes (CubeProjector, GenieManager, …) can read it
 * without Angular plumbing; SettingsService is the single writer.
 *
 *   scale 1   → designed timings (the default — smoke asserts against these)
 *   scale 0.5 → half speed (cinematic)
 *   scale 1.5 → snappier
 *   scale 0   → reduced motion: every one-shot returns duration 0 (instant),
 *               so state still lands exactly where the animation would have.
 */
let scale = 1;

export const setMotionScale = (s: number): void => {
  scale = s;
};

export const motionScale = (): number => scale;

export const reducedMotion = (): boolean => scale === 0;

/** Effective duration for a designed base duration under the current scale. */
export const ms = (base: number): number => (scale === 0 ? 0 : Math.round(base / scale));
