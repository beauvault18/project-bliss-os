import { useWindowStore } from '../core/windowStore';
import { APPS, getApp } from '../core/appRegistry';
import { SystemTray } from './SystemTray';

export function Taskbar({
  startOpen,
  onToggleStart,
}: {
  startOpen: boolean;
  onToggleStart: () => void;
}) {
  const windows = useWindowStore((s) => s.windows);
  const running = useWindowStore((s) => s.running);
  const openOrFocus = useWindowStore((s) => s.openOrFocus);
  const minimize = useWindowStore((s) => s.minimize);

  // One entry per running app (registry order), including windowless ones.
  const entries = APPS.filter((a) => running[a.id]).map((a) => {
    const wins = windows.filter((w) => w.appId === a.id);
    const top = wins.length
      ? wins.reduce((x, y) => (x.z >= y.z ? x : y))
      : null;
    const active = !!top && top.focused && !top.minimized;
    return { appId: a.id, hasWindow: wins.length > 0, top, active };
  });

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
        {entries.map(({ appId, top, active }) => {
          const app = getApp(appId);
          return (
            <button
              key={appId}
              className={`task${active ? ' task--active' : ''}`}
              data-testid="task-button"
              data-appid={appId}
              onClick={() =>
                active && top ? minimize(top.id) : openOrFocus(appId)
              }
            >
              <span className="task__dot" aria-hidden />
              <span aria-hidden>{app?.icon}</span>
              <span className="task__label">{app?.title}</span>
            </button>
          );
        })}
      </div>

      <SystemTray />
    </div>
  );
}
