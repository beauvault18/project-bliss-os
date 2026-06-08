import type { ReactNode } from 'react';

/**
 * A depth layer that parallaxes off the shared --px/--py/--pstr CSS variables
 * (set once per frame by LivingParallaxDesktop). Pure CSS transform — no React
 * re-render per frame.
 */
export function ParallaxLayer({
  depth,
  className,
  testid,
  children,
}: {
  depth: number;
  className?: string;
  testid?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`parallax-layer ${className ?? ''}`}
      data-testid={testid}
      style={{
        transform: `translate3d(calc(var(--px, 0) * var(--pstr, 0.5) * ${depth}px), calc(var(--py, 0) * var(--pstr, 0.5) * ${depth}px), 0)`,
      }}
    >
      {children}
    </div>
  );
}
