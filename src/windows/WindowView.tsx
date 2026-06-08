import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useSpring, animated, to } from '@react-spring/web';
import { useDrag } from '@use-gesture/react';
import type { WindowState } from '../core/types';
import { useWindowStore } from '../core/windowStore';
import { getApp } from '../core/appRegistry';
import { magneticSnap } from '../core/snapping';
import { Titlebar } from './Titlebar';
import { ReactWindowHost } from '../framework-bridges/ReactWindowHost';
import { AngularWindowHost } from '../framework-bridges/AngularWindowHost';

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export function WindowView({ win }: { win: WindowState }) {
  const { width, height } = useThree((s) => s.size);
  const focus = useWindowStore((s) => s.focus);
  const move = useWindowStore((s) => s.move);
  const app = getApp(win.appId);

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

  const bind = useDrag(
    ({ first, last, down, delta: [dx, dy], velocity: [vx, vy], direction: [dirX, dirY] }) => {
      if (first) focus(win.id);

      if (down && !last) {
        move(win.id, dx, dy);
        const svx = vx * dirX;
        const svy = vy * dirY;
        api.start({
          skewX: clamp(-svx * 5, -14, 14),
          skewY: clamp(-svy * 3, -10, 10),
          scaleX: 1 + clamp(Math.abs(svx) * 0.05, 0, 0.09),
          scaleY: 1 - clamp(Math.abs(svx) * 0.04, 0, 0.07),
          config: { tension: 320, friction: 18 },
        });
      }

      if (last) {
        // Magnetic snap to edges/neighbors using fresh positions.
        const st = useWindowStore.getState();
        const cur = st.windows.find((w) => w.id === win.id);
        if (cur) {
          const snapped = magneticSnap(
            cur,
            st.windows.filter((o) => o.id !== cur.id),
            { w: width, h: height },
          );
          st.setPos(cur.id, snapped.x, snapped.y);
        }
        // Springy settle (low friction => visible wobble).
        api.start({
          skewX: 0,
          skewY: 0,
          scaleX: 1,
          scaleY: 1,
          config: { tension: 200, friction: 11 },
        });
      }
    },
    { filterTaps: true, pointer: { keys: false } },
  );

  return (
    <group position={[wx, wy, win.z]}>
      <Html
        center
        zIndexRange={[win.z, win.z]}
        style={{ pointerEvents: 'none' }}
        prepend
      >
        <animated.div
          className={`window${win.focused ? ' window--focused' : ''}`}
          data-testid="window"
          data-appid={win.appId}
          style={{
            width: win.w,
            height: win.h,
            opacity: win.opacity,
            pointerEvents: 'auto',
            transformOrigin: '50% 0%',
            transform: to(
              [styles.skewX, styles.skewY, styles.scaleX, styles.scaleY],
              (kx, ky, sx, sy) =>
                `skew(${kx}deg, ${ky}deg) scale(${sx}, ${sy})`,
            ),
          }}
          onPointerDown={() => focus(win.id)}
        >
          <Titlebar win={win} bind={bind() as Record<string, unknown>} />
          <div className="window__body">
            {app?.body.framework === 'react' ? (
              <ReactWindowHost
                component={app.body.component}
                windowId={win.id}
              />
            ) : app?.body.framework === 'angular' ? (
              <AngularWindowHost component={app.body.component} />
            ) : null}
          </div>
        </animated.div>
      </Html>
    </group>
  );
}
