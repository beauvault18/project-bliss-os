import { useRef, useState } from 'react';
import type { WindowState } from '../core/types';
import { getApp } from '../core/appRegistry';
import { useWindowStore } from '../core/windowStore';
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

  return (
    <div
      className={`titlebar${win.focused ? '' : ' titlebar--blurred'}`}
      {...bind}
      onDoubleClick={() =>
        useWindowStore.getState().toggleMaximize(win.id, viewport())
      }
      data-testid="titlebar"
    >
      <span className="titlebar__name">
        <span className="titlebar__icon">{app?.icon}</span>
        {win.title}
      </span>

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
