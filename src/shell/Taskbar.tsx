import { useWindowStore } from '../core/windowStore';
import { useWorkspaceStore } from '../core/workspaceStore';
import { usePreferencesStore } from '../core/preferencesStore';
import { APPS, getApp } from '../core/appRegistry';
import {
  animatedMinimize,
  animatedRestore,
} from '../effects/windowAnimationStore';
import { SystemTray } from './SystemTray';
import { WorkspaceIndicator } from './WorkspaceIndicator';

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
  const focus = useWindowStore((s) => s.focus);
  const activeWorkspace = useWorkspaceStore((s) => s.active);
  const switchTo = useWorkspaceStore((s) => s.switchTo);
  const showDots = usePreferencesStore((s) => s.showTaskbarDots);

  // One entry per running app (registry order), including windowless ones, and
  // regardless of workspace — the taskbar always reflects everything running.
  const entries = APPS.filter((a) => running[a.id]).map((a) => {
    const wins = windows.filter((w) => w.appId === a.id);
    const top = wins.length
      ? wins.reduce((x, y) => (x.z >= y.z ? x : y))
      : null;
    // "Active" (click = minimize) only when it's the focused window on THIS
    // workspace; otherwise a click brings it here / restores / launches it.
    const active =
      !!top && top.focused && !top.minimized && top.workspace === activeWorkspace;
    const elsewhere = !!top && top.workspace !== activeWorkspace;
    return { appId: a.id, top, active, elsewhere };
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
        {entries.map(({ appId, top, active, elsewhere }) => {
          const app = getApp(appId);
          return (
            <button
              key={appId}
              className={`task${active ? ' task--active' : ''}${elsewhere ? ' task--elsewhere' : ''}`}
              data-testid="task-button"
              data-appid={appId}
              title={elsewhere ? `On Workspace ${top!.workspace + 1}` : app?.title}
              onClick={() => {
                // Window on another workspace: hop there, then surface it.
                if (top && elsewhere) {
                  switchTo(top.workspace);
                  if (top.minimized) animatedRestore(top.id, appId);
                  else focus(top.id);
                } else if (active && top) animatedMinimize(top.id, appId);
                else if (top && top.minimized) animatedRestore(top.id, appId);
                else openOrFocus(appId);
              }}
            >
              {showDots && <span className="task__dot" aria-hidden />}
              <span aria-hidden>{app?.icon}</span>
              <span className="task__label">{app?.title}</span>
            </button>
          );
        })}
      </div>

      <WorkspaceIndicator />
      <SystemTray />
    </div>
  );
}
