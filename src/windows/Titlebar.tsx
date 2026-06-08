import { useRef, useState } from 'react';
import type { WindowState } from '../core/types';
import { getApp } from '../core/appRegistry';
import { useWindowStore } from '../core/windowStore';
import { usePreferencesStore } from '../core/preferencesStore';
import { RapidControlMenu } from '../shell/RapidControlMenu';

const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });

export function Titlebar({
  win,
  bind,
}: {
  win: WindowState;
  /** Spreadable gesture props from use-gesture's bind(). */
  bind: Record<string, unknown>;
}) {
  const app = getApp(win.appId);
  const controlSide = usePreferencesStore((s) => s.controlSide);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<DOMRect | null>(null);

  const toggleMenu = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (menu) {
      setMenu(null);
    } else if (btnRef.current) {
      setMenu(btnRef.current.getBoundingClientRect());
    }
  };

  const rapidButton = (
    <button
      ref={btnRef}
      className={`rapid-btn${menu ? ' rapid-btn--active' : ''}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={toggleMenu}
      title="Rapid Control"
      data-testid="rapid-btn"
    >
      ✦
    </button>
  );

  return (
    <div
      className={`titlebar titlebar--${controlSide}${win.focused ? '' : ' titlebar--blurred'}`}
      {...bind}
      onDoubleClick={() =>
        useWindowStore.getState().toggleMaximize(win.id, viewport())
      }
      data-testid="titlebar"
    >
      {controlSide === 'left' && rapidButton}

      <span className="titlebar__name">
        <span className="titlebar__icon">{app?.icon}</span>
        {win.title}
      </span>

      {controlSide === 'right' && rapidButton}

      {menu && (
        <RapidControlMenu
          win={win}
          anchor={menu}
          viewport={viewport()}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
