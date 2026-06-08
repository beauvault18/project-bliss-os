import { useWindowStore } from '../core/windowStore';
import { getApp } from '../core/appRegistry';
import { SystemTray } from './SystemTray';

export function Taskbar({
  startOpen,
  onToggleStart,
}: {
  startOpen: boolean;
  onToggleStart: () => void;
}) {
  const windows = useWindowStore((s) => s.windows);
  const focus = useWindowStore((s) => s.focus);
  const minimize = useWindowStore((s) => s.minimize);

  return (
    <div className="taskbar">
      <button
        className={`start-button${startOpen ? ' start-button--active' : ''}`}
        onClick={onToggleStart}
        data-testid="start-button"
      >
        <span className="start-button__logo" aria-hidden>
          ⊞
        </span>
        start
      </button>

      <div className="taskbar__tasks">
        {windows.map((w) => {
          const active = w.focused && !w.minimized;
          return (
            <button
              key={w.id}
              className={`task${active ? ' task--active' : ''}`}
              onClick={() => (active ? minimize(w.id) : focus(w.id))}
              data-testid="task-button"
            >
              <span aria-hidden>{getApp(w.appId)?.icon}</span>
              <span className="task__label">{w.title}</span>
            </button>
          );
        })}
      </div>

      <SystemTray />
    </div>
  );
}
