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
  const lastOpenRef = useRef(0);
  const [menu, setMenu] = useState<DOMRect | null>(null);

  const toggleMenu = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (menu) {
      // Ignore the "close" half of an accidental double-click so the menu
      // doesn't open-then-immediately-close (which reads as "nothing happened").
      if (performance.now() - lastOpenRef.current < 300) return;
      setMenu(null);
    } else if (btnRef.current) {
      lastOpenRef.current = performance.now();
      setMenu(btnRef.current.getBoundingClientRect());
    }
  };

  const rapidButton = (
    <button
      ref={btnRef}
      className={`rapid-btn${menu ? ' rapid-btn--active' : ''}`}
      // Toggle on pointerdown, NOT click: the titlebar's drag gesture captures
      // the pointer on press, which suppresses the browser's native click on
      // this child button — so onClick never fires for a real mouse. onClick is
      // kept too so programmatic/keyboard activation still works; the 300ms
      // guard in toggleMenu stops the two from cancelling each other out.
      onPointerDown={toggleMenu}
      onClick={toggleMenu}
      onDoubleClick={(e) => e.stopPropagation()}
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
