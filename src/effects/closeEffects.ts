import type { CSSProperties } from 'react';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Wrapper styles for the close/quit "burn down" effect. progress 1 = intact,
 * 0 = fully gone. The burn travels top→bottom via a clip-path inset from the
 * top; a char/darken filter and fade complete the disappearance.
 */

// Soft "Ember Close" — gentle blue/orange ember fade; the app stays running.
export function emberCloseStyle(progress: number): CSSProperties {
  const t = 1 - progress;
  return {
    transform: 'none',
    clipPath: `inset(${t * 100}% 0% 0% 0%)`,
    opacity: lerp(1, 0.55, t),
    borderRadius: '8px',
    filter: `brightness(${1 - t * 0.15}) saturate(${1 + t * 0.35})`,
    willChange: 'clip-path, opacity, filter',
  };
}

// Dramatic "Fire Quit" — chars/darkens and collapses; the app fully quits.
export function fireQuitStyle(progress: number, dramatic: boolean): CSSProperties {
  const t = 1 - progress;
  const charge = dramatic ? 1.25 : 1;
  return {
    transform: `scale(${1 - t * 0.05})`,
    clipPath: `inset(${t * 100}% 0% 0% 0%)`,
    opacity: lerp(1, 0.35, t),
    borderRadius: '8px',
    filter: `brightness(${1 - t * 0.6 * charge}) sepia(${t * 0.7}) contrast(${1 + t * 0.5}) saturate(${1 + t * 0.6})`,
    willChange: 'clip-path, opacity, filter, transform',
  };
}
