import { useMemo } from 'react';
import { animated, type SpringValue } from '@react-spring/web';
import type { ClosePreset } from '../core/animationPresets';

/**
 * Lightweight burn overlay for close/quit: a glowing burn line travels top→
 * bottom (driven by `progress` 1→0), a char/smoke gradient darkens the burned
 * region, and a few ember sparks fall. No physics engine — pure CSS + springs.
 */
export function FireCloseOverlay({
  progress,
  preset,
  dramatic,
}: {
  progress: SpringValue<number>;
  preset: ClosePreset;
  dramatic: boolean;
}) {
  const count = preset.baseEmbers + (dramatic ? 8 : 0);
  const embers = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: Math.random() * 100,
        size: 3 + Math.random() * (dramatic ? 7 : 4),
        fall: 16 + Math.random() * 44,
        flick: 0.5 + Math.random() * 0.5,
      })),
    [count, dramatic],
  );

  // Burned fraction from the top = 1 - progress.
  const lineTop = progress.to((p) => `${(1 - p) * 100}%`);
  const charHeight = progress.to((p) => `${(1 - p) * 100}%`);

  return (
    <div className="fire-overlay" data-testid="fire-overlay">
      {/* Charred / smoke region above the burn line. */}
      <animated.div
        className="fire-char"
        style={{
          height: charHeight,
          background: `linear-gradient(180deg, rgba(8,6,4,${dramatic ? 0.72 : 0.32}) 0%, rgba(8,6,4,0) 100%)`,
        }}
      />
      {/* The burn line itself. */}
      <animated.div
        className="fire-line"
        style={{
          top: lineTop,
          background: preset.palette.glow,
          boxShadow: `0 0 14px 4px ${preset.palette.glow}, 0 0 32px 10px ${preset.palette.ember}`,
          opacity: progress.to((p) => (p <= 0.02 || p >= 0.999 ? 0 : 1)),
        }}
      />
      {/* Falling embers. */}
      {embers.map((e, i) => (
        <animated.div
          key={i}
          className="fire-ember"
          style={{
            left: `${e.x}%`,
            width: e.size,
            height: e.size,
            background: preset.palette.ember,
            boxShadow: `0 0 6px 1px ${preset.palette.ember}`,
            top: progress.to((p) => `${(1 - p) * 100 + (1 - p) * e.fall}%`),
            opacity: progress.to(
              (p) => Math.max(0, Math.sin((1 - p) * Math.PI)) * e.flick,
            ),
          }}
        />
      ))}
    </div>
  );
}
