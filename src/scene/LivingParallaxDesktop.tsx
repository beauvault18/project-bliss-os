import { useEffect } from 'react';
import { usePreferencesStore } from '../core/preferencesStore';
import { ParallaxLayer } from './ParallaxLayer';

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Futuristic "living" background that sits above the WebGL canvas and below the
 * UI: a digital horizon, a perspective grid, drifting mist, and (in Hacker Mode)
 * scanlines + extra glow. A single rAF loop smooths the pointer into shared CSS
 * variables (--px/--py/--pstr) that every layer reads, so there is no per-frame
 * React render. Respects prefers-reduced-motion.
 */
export function LivingParallaxDesktop() {
  const enabled = usePreferencesStore((s) => s.parallaxEnabled);
  const strength = usePreferencesStore((s) => s.parallaxStrength);
  const hacker = usePreferencesStore((s) => s.hackerMode);

  // Keep --pstr in sync with the strength slider.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--pstr',
      (strength / 100).toFixed(3),
    );
  }, [strength]);

  // Smooth the pointer into --px/--py once per frame.
  useEffect(() => {
    const root = document.documentElement;
    if (!enabled || reducedMotion()) {
      root.style.setProperty('--px', '0');
      root.style.setProperty('--py', '0');
      return;
    }
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    const onMove = (e: MouseEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const loop = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      root.style.setProperty('--px', cx.toFixed(4));
      root.style.setProperty('--py', cy.toFixed(4));
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      className={`living-parallax${hacker ? ' living-parallax--hacker' : ''}`}
      data-testid="parallax-desktop"
    >
      <ParallaxLayer depth={-10} className="lp-horizon" />
      <ParallaxLayer depth={-26} className="lp-grid" testid="parallax-grid" />
      <ParallaxLayer depth={-40} className="lp-mist" />
      {hacker && (
        <>
          <ParallaxLayer
            depth={-52}
            className="lp-scanlines"
            testid="hacker-layer"
          />
          <div className="lp-hacker-glow" />
        </>
      )}
    </div>
  );
}
