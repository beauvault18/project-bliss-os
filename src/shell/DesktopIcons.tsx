import { useState } from 'react';
import { animated, useSpring } from '@react-spring/web';
import { DESKTOP_APPS } from '../core/appRegistry';
import { useWindowStore } from '../core/windowStore';
import { useRunningAppIds } from '../core/appLifecycle';

function DesktopIcon({
  appId,
  glyph,
  label,
  running,
  onLaunch,
}: {
  appId: string;
  glyph: string;
  label: string;
  running: boolean;
  onLaunch: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [{ scale, y }, api] = useSpring(() => ({
    scale: 1,
    y: 0,
    config: { tension: 380, friction: 14 },
  }));

  const bounce = () => {
    // Squash-down then springy pop on click.
    api.start({
      to: async (next) => {
        await next({ scale: 0.82, y: 4, config: { tension: 600, friction: 18 } });
        await next({ scale: 1, y: 0, config: { tension: 320, friction: 9 } });
      },
    });
    onLaunch();
  };

  return (
    <button
      className="desktop-icon"
      data-testid="desktop-icon"
      data-appid={appId}
      onClick={bounce}
      onMouseEnter={() => {
        setHover(true);
        api.start({ scale: 1.12 });
      }}
      onMouseLeave={() => {
        setHover(false);
        api.start({ scale: 1 });
      }}
    >
      <animated.span
        className={`desktop-icon__glyph${hover ? ' desktop-icon__glyph--hover' : ''}`}
        style={{ transform: y.to((v) => `translateY(${v}px)`), scale }}
      >
        {glyph}
        {running && <span className="desktop-icon__dot" aria-hidden />}
      </animated.span>
      <span className="desktop-icon__label">{label}</span>
    </button>
  );
}

export function DesktopIcons() {
  const openOrFocus = useWindowStore((s) => s.openOrFocus);
  const running = useRunningAppIds();

  return (
    <div className="desktop-icons" data-testid="desktop-icons">
      {DESKTOP_APPS.map((app) => (
        <DesktopIcon
          key={app.id}
          appId={app.id}
          glyph={app.icon}
          label={app.title}
          running={running.includes(app.id)}
          onLaunch={() => openOrFocus(app.id)}
        />
      ))}
    </div>
  );
}
