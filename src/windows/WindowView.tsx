import { useEffect, useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useSpring, animated, to } from '@react-spring/web';
import { useDrag } from '@use-gesture/react';
import type { WindowState } from '../core/types';
import { useWindowStore } from '../core/windowStore';
import { getApp } from '../core/appRegistry';
import { magneticSnap } from '../core/snapping';
import { getMinimizePreset, getClosePreset } from '../core/animationPresets';
import { usePreferencesStore, animSpeedFactor } from '../core/preferencesStore';
import { useWindowAnimationStore } from '../effects/windowAnimationStore';
import { computeGenieGeometry } from '../effects/minimizeEffects';
import { FireCloseOverlay } from '../effects/FireCloseOverlay';
import { Titlebar } from './Titlebar';
import { ReactWindowHost } from '../framework-bridges/ReactWindowHost';
import { AngularWindowHost } from '../framework-bridges/AngularWindowHost';

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const IDENTITY_GEO = { dx: 0, dy: 0, targetScale: 0.08, pointDown: true };

export function WindowView({ win }: { win: WindowState }) {
  const { width, height } = useThree((s) => s.size);
  const focus = useWindowStore((s) => s.focus);
  const move = useWindowStore((s) => s.move);
  const app = getApp(win.appId);

  // Live design preferences (Bliss Lab).
  const wobbleStrength = usePreferencesStore((s) => s.wobbleStrength);
  const wobbleSpeed = usePreferencesStore((s) => s.wobbleSpeed);
  const snapStrength = usePreferencesStore((s) => s.snapStrength);
  const animationSpeed = usePreferencesStore((s) => s.animationSpeed);
  const dramatic = usePreferencesStore((s) => s.dramaticMode);
  const glass = usePreferencesStore((s) => s.glassMode);
  const showDebug = usePreferencesStore((s) => s.showAnimationDebug);

  const wobbleK = wobbleStrength / 60; // 60 = baseline feel
  const wobbleTension = 320 * (0.5 + wobbleSpeed / 100);
  const speedFactor = animSpeedFactor(animationSpeed);

  // Minimize/restore/close animation status for this window.
  const anim = useWindowAnimationStore((s) => s.anims[win.id]);
  const animStatus = anim?.status;
  const isClosing = animStatus === 'closing' || animStatus === 'quitting';
  const preset = getMinimizePreset(anim?.presetId ?? 'genie');
  const closePreset = isClosing ? getClosePreset(anim!.presetId) : null;

  // Window center in world units (ortho, 1 unit == 1 px, +y up, origin center).
  const wx = win.x + win.w / 2 - width / 2;
  const wy = -(win.y + win.h / 2 - height / 2);

  // Compiz "jelly": skew leans into motion, squash-and-stretch preserves volume,
  // and the release spring overshoots (low friction) to wobble back to rest.
  const [styles, api] = useSpring(() => ({
    skewX: 0,
    skewY: 0,
    scaleX: 1,
    scaleY: 1,
    config: { tension: 320, friction: 18 },
  }));

  // Genie progress: 1 = fully shown, 0 = collapsed at the taskbar. Starts pinned
  // at 0 when this window mounts mid-restore so it expands instead of flashing.
  const [{ progress }, progressApi] = useSpring(() => ({
    progress: anim?.status === 'restoring' ? 0 : 1,
  }));

  const geo = useMemo(
    () =>
      anim?.target
        ? computeGenieGeometry(
            { x: win.x, y: win.y, w: win.w, h: win.h },
            anim.target,
          )
        : IDENTITY_GEO,
    [anim, win.x, win.y, win.w, win.h],
  );

  // Drive the genie animation off the status. minimized=true is committed only
  // on the spring's onRest, so the window never vanishes before the animation.
  useEffect(() => {
    const scaleCfg = (c: { tension?: number; friction?: number }) => ({
      tension: (c.tension ?? 230) * speedFactor,
      friction: (c.friction ?? 24) * (dramatic ? 0.8 : 1),
    });
    if (animStatus === 'minimizing') {
      progressApi.start({
        progress: 0,
        config: scaleCfg(preset.config),
        onRest: () => {
          const a = useWindowAnimationStore.getState().anims[win.id];
          if (a?.status === 'minimizing') {
            useWindowStore.getState().minimize(win.id);
            useWindowAnimationStore.getState().clear(win.id);
          }
        },
      });
    } else if (animStatus === 'restoring') {
      progressApi.set({ progress: 0 });
      progressApi.start({
        progress: 1,
        config: scaleCfg(preset.restoreConfig ?? preset.config),
        onRest: () => {
          if (useWindowAnimationStore.getState().anims[win.id]?.status === 'restoring') {
            useWindowAnimationStore.getState().clear(win.id);
          }
        },
      });
    } else if (animStatus === 'closing' || animStatus === 'quitting') {
      // Burn down over a deterministic duration, then finalize. Finalization is
      // driven by a timer (not the spring's onRest, which is unreliable for
      // duration tweens), so the window always leaves exactly when the burn ends.
      const quitting = animStatus === 'quitting';
      const appIdForQuit = anim?.appId ?? win.appId;
      const dur = (closePreset?.durationMs ?? 1000) / speedFactor;
      progressApi.set({ progress: 1 });
      progressApi.start({ progress: 0, config: { duration: dur } });
      const timer = setTimeout(() => {
        if (!useWindowAnimationStore.getState().anims[win.id]) return;
        if (quitting) useWindowStore.getState().quitApp(appIdForQuit);
        else useWindowStore.getState().closeWindow(win.id);
        useWindowAnimationStore.getState().clear(win.id);
      }, dur + 60);
      return () => clearTimeout(timer);
    } else {
      progressApi.start({ progress: 1, config: { tension: 300, friction: 26 } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animStatus]);

  const bind = useDrag(
    ({ first, last, down, delta: [dx, dy], velocity: [vx, vy], direction: [dirX, dirY] }) => {
      if (first) focus(win.id);

      if (down && !last) {
        move(win.id, dx, dy);
        const svx = vx * dirX;
        const svy = vy * dirY;
        api.start({
          skewX: clamp(-svx * 5 * wobbleK, -14 * wobbleK, 14 * wobbleK),
          skewY: clamp(-svy * 3 * wobbleK, -10 * wobbleK, 10 * wobbleK),
          scaleX: 1 + clamp(Math.abs(svx) * 0.05 * wobbleK, 0, 0.12),
          scaleY: 1 - clamp(Math.abs(svx) * 0.04 * wobbleK, 0, 0.1),
          config: { tension: wobbleTension, friction: 18 },
        });
      }

      if (last) {
        const st = useWindowStore.getState();
        const cur = st.windows.find((w) => w.id === win.id);
        if (cur) {
          const threshold = (snapStrength / 100) * 36; // 50 -> 18px baseline
          const snapped = magneticSnap(
            cur,
            st.windows.filter((o) => o.id !== cur.id),
            { w: width, h: height },
            threshold,
          );
          st.setPos(cur.id, snapped.x, snapped.y);
        }
        api.start({
          skewX: 0,
          skewY: 0,
          scaleX: 1,
          scaleY: 1,
          config: { tension: 200 * (wobbleSpeed / 50), friction: 11 },
        });
      }
    },
    { filterTaps: true, pointer: { keys: false } },
  );

  const interactive = !anim; // disable input while collapsing/expanding

  // Wrapper style: close/quit burn when closing, otherwise the genie transform.
  const wrapStyleFor = (p: number) =>
    closePreset ? closePreset.style(p, dramatic) : preset.style(p, geo);

  return (
    <group position={[wx, wy, win.z]}>
      <Html center zIndexRange={[win.z, win.z]} style={{ pointerEvents: 'none' }} prepend>
        {/* Genie wrapper: minimize/restore transform, or close/quit burn. */}
        <animated.div
          className="window-genie"
          data-testid="window"
          data-appid={win.appId}
          style={{
            width: win.w,
            height: win.h,
            pointerEvents: 'auto',
            transform: progress.to((p) => wrapStyleFor(p).transform as string),
            transformOrigin: closePreset ? '50% 0%' : '50% 50%',
            opacity: progress.to((p) => wrapStyleFor(p).opacity as number),
            clipPath: progress.to((p) => wrapStyleFor(p).clipPath as string),
            borderRadius: progress.to((p) => wrapStyleFor(p).borderRadius as string),
            filter: progress.to((p) => (wrapStyleFor(p).filter as string) ?? 'none'),
          }}
        >
          {showDebug && anim && (
            <span className="window-debug" data-testid="anim-debug">
              {anim.status} · {anim.presetId}
            </span>
          )}
          {/* Inner window: existing wobble + transparency, unchanged. */}
          <animated.div
            className={`window${win.focused ? ' window--focused' : ''}${glass ? ' window--glass' : ''}`}
            style={{
              width: '100%',
              height: '100%',
              opacity: win.opacity,
              pointerEvents: interactive ? 'auto' : 'none',
              transformOrigin: '50% 0%',
              transform: to(
                [styles.skewX, styles.skewY, styles.scaleX, styles.scaleY],
                (kx, ky, sx, sy) => `skew(${kx}deg, ${ky}deg) scale(${sx}, ${sy})`,
              ),
            }}
            onPointerDown={() => focus(win.id)}
          >
            <Titlebar win={win} bind={bind() as Record<string, unknown>} />
            <div className="window__body">
              {app?.body.framework === 'react' ? (
                <ReactWindowHost component={app.body.component} windowId={win.id} />
              ) : app?.body.framework === 'angular' ? (
                <AngularWindowHost component={app.body.component} />
              ) : null}
            </div>
          </animated.div>
          {closePreset && (
            <FireCloseOverlay
              progress={progress}
              preset={closePreset}
              dramatic={dramatic}
            />
          )}
        </animated.div>
      </Html>
    </group>
  );
}
