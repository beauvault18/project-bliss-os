import { useEffect } from 'react';
import { animated, useSpring, easings } from '@react-spring/web';
import { useWindowStore } from '../core/windowStore';
import {
  useWorkspaceStore,
  WORKSPACE_COUNT,
} from '../core/workspaceStore';
import { usePreferencesStore } from '../core/preferencesStore';
import { getApp } from '../core/appRegistry';

// Rotation duration per speed. A fixed duration (rather than a spring's
// onRest) keeps the cube's lifetime deterministic — it always tears down on
// schedule, so it can never get stuck on screen.
const CUBE_MS = {
  slow: 1400,
  normal: 950,
  fast: 620,
} as const;

// How far the desktop "pulls back" and tilts while the cube spins.
const INTENSITY = {
  low: { scale: 0.82, tiltX: -4 },
  normal: { scale: 0.68, tiltX: -10 },
  high: { scale: 0.56, tiltX: -16 },
} as const;

/** Shortest signed quarter-turn delta between two faces of a 4-sided cube. */
function shortestDelta(from: number, to: number): number {
  let d = to - from;
  if (d > 2) d -= 4;
  if (d < -2) d += 4;
  return d;
}

/**
 * The Compiz-style workspace cube. Rendered only while a switch is in flight
 * (workspaceStore.spin). Faces are simplified mini-previews — workspace name +
 * scaled-down cards for the windows living on that workspace. Purely visual:
 * the active workspace has already changed in the store before we mount.
 */
export function WorkspaceCube() {
  const spin = useWorkspaceStore((s) => s.spin);
  const endSpin = useWorkspaceStore((s) => s.endSpin);
  const windows = useWindowStore((s) => s.windows);
  const speed = usePreferencesStore((s) => s.cubeSpeed);
  const intensity = usePreferencesStore((s) => s.cubeIntensity);

  const [{ ry }, api] = useSpring(() => ({ ry: 0 }));

  // Spin from the previous face (forward at ry=0) round to the new one, then
  // tear the cube down on a deterministic timer. Re-runs on each switch
  // (spin is a fresh object each time switchTo fires).
  useEffect(() => {
    if (!spin) return;
    const dur = CUBE_MS[speed];
    const delta = shortestDelta(spin.from, spin.to);
    api.set({ ry: 0 });
    api.start({
      ry: -delta * 90,
      config: { duration: dur, easing: easings.easeInOutCubic },
    });
    const timer = setTimeout(() => endSpin(), dur + 80);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spin]);

  if (!spin) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const depth = vw / 2;
  const { scale, tiltX } = INTENSITY[intensity];

  return (
    <div className="ws-cube-backdrop" data-testid="workspace-cube">
      <div
        className="ws-cube-stage"
        style={{ transform: `scale(${scale}) rotateX(${tiltX}deg)` }}
      >
        <animated.div
          className="ws-cube"
          style={{
            width: vw,
            height: vh,
            transform: ry.to(
              (r) => `translateZ(${-depth}px) rotateY(${r}deg)`,
            ),
          }}
        >
          {Array.from({ length: WORKSPACE_COUNT }, (_, i) => {
            const angle = shortestDelta(spin.from, i) * 90;
            const faceWins = windows.filter(
              (w) => w.workspace === i && !w.minimized,
            );
            return (
              <div
                key={i}
                className={`ws-cube-face${i === spin.to ? ' ws-cube-face--target' : ''}`}
                data-testid="ws-cube-face"
                data-ws={i}
                style={{
                  width: vw,
                  height: vh,
                  transform: `rotateY(${angle}deg) translateZ(${depth}px)`,
                }}
              >
                <div className="ws-cube-face__name">Workspace {i + 1}</div>
                {faceWins.length === 0 && (
                  <div className="ws-cube-face__empty">Empty desktop</div>
                )}
                {faceWins.map((w) => {
                  const app = getApp(w.appId);
                  return (
                    <div
                      key={w.id}
                      className="ws-cube-card"
                      style={{
                        left: `${(w.x / vw) * 100}%`,
                        top: `${(w.y / vh) * 100}%`,
                        width: `${(w.w / vw) * 100}%`,
                        height: `${(w.h / vh) * 100}%`,
                      }}
                    >
                      <span className="ws-cube-card__icon" aria-hidden>
                        {app?.icon}
                      </span>
                      <span className="ws-cube-card__title">{w.title}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </animated.div>
      </div>
    </div>
  );
}
