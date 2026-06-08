import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { animated, useSpring } from '@react-spring/web';
import type { WindowState } from '../core/types';
import { useWindowStore } from '../core/windowStore';
import { animatedMinimize } from '../effects/windowAnimationStore';

const MENU_W = 210;

export function RapidControlMenu({
  win,
  anchor,
  viewport,
  onClose,
}: {
  win: WindowState;
  anchor: DOMRect;
  viewport: { w: number; h: number };
  onClose: () => void;
}) {
  const store = useWindowStore.getState;

  // Close on Esc (capture so Desktop's fullscreen-exit handler doesn't also fire).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const spring = useSpring({
    from: { scale: 0.85, opacity: 0 },
    to: { scale: 1, opacity: 1 },
    config: { tension: 420, friction: 22 },
  });

  const run = (fn: () => void, close = true) => {
    fn();
    if (close) onClose();
  };

  const left = Math.min(
    Math.max(8, anchor.right - MENU_W),
    viewport.w - MENU_W - 8,
  );
  const top = Math.min(anchor.bottom + 6, viewport.h - 320);

  const items: { glyph: string; label: string; onClick: () => void; danger?: boolean }[] = [
    { glyph: '◧', label: 'Dock Left', onClick: () => run(() => store().dock(win.id, 'left', viewport)) },
    { glyph: '◨', label: 'Dock Right', onClick: () => run(() => store().dock(win.id, 'right', viewport)) },
    { glyph: '⛶', label: 'Fullscreen', onClick: () => run(() => store().toggleMaximize(win.id, viewport)) },
    { glyph: '▁', label: 'Minimize', onClick: () => run(() => animatedMinimize(win.id, win.appId)) },
    { glyph: '✕', label: 'Close Window', onClick: () => run(() => store().closeWindow(win.id)) },
    { glyph: '⏻', label: 'Quit App', onClick: () => run(() => store().quitApp(win.appId)), danger: true },
  ];

  return createPortal(
    <>
      <div className="rcm-scrim" onClick={onClose} data-testid="rcm-scrim" />
      <animated.div
        className="rcm"
        data-testid="rapid-menu"
        style={{
          left,
          top,
          opacity: spring.opacity,
          transform: spring.scale.to((s) => `scale(${s})`),
          transformOrigin: 'top right',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rcm__title">Rapid Control</div>
        {items.map((it) => (
          <button
            key={it.label}
            className={`rcm__item${it.danger ? ' rcm__item--danger' : ''}`}
            data-testid={`rcm-${it.label.replace(/\s+/g, '-').toLowerCase()}`}
            onClick={it.onClick}
          >
            <span className="rcm__glyph">{it.glyph}</span>
            {it.label}
          </button>
        ))}
        <div className="rcm__slider">
          <span>Opacity</span>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.01}
            value={win.opacity}
            data-testid="rcm-opacity"
            onChange={(e) => store().setOpacity(win.id, parseFloat(e.target.value))}
          />
          <span className="rcm__pct">{Math.round(win.opacity * 100)}%</span>
        </div>
      </animated.div>
    </>,
    document.body,
  );
}
