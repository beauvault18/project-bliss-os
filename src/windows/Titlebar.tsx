import type { WindowState } from '../core/types';
import { getApp } from '../core/appRegistry';

export function Titlebar({
  win,
  bind,
  onClose,
  onMinimize,
  onMaximize,
}: {
  win: WindowState;
  /** Spreadable gesture props from use-gesture's bind(). */
  bind: Record<string, unknown>;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
}) {
  const app = getApp(win.appId);
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <div
      className={`titlebar${win.focused ? '' : ' titlebar--blurred'}`}
      {...bind}
      onDoubleClick={onMaximize}
      data-testid="titlebar"
    >
      <span className="titlebar__name">
        <span className="titlebar__icon">{app?.icon}</span>
        {win.title}
      </span>
      <div className="titlebar__buttons">
        <button
          className="tb-btn tb-btn--min"
          onPointerDown={stop}
          onClick={onMinimize}
          title="Minimize"
        >
          _
        </button>
        <button
          className="tb-btn tb-btn--max"
          onPointerDown={stop}
          onClick={onMaximize}
          title="Maximize"
        >
          ▢
        </button>
        <button
          className="tb-btn tb-btn--close"
          onPointerDown={stop}
          onClick={onClose}
          title="Close"
          data-testid="close-btn"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
