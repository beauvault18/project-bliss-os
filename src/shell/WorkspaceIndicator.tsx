import { useWindowStore } from '../core/windowStore';
import { useWorkspaceStore, WORKSPACE_COUNT } from '../core/workspaceStore';

/**
 * The "1 2 3 4" workspace pager that lives in the taskbar. The active workspace
 * is highlighted; each pip shows a dot when that workspace has open windows.
 * Clicking a pip switches workspaces (with the cube animation).
 */
export function WorkspaceIndicator() {
  const active = useWorkspaceStore((s) => s.active);
  const switchTo = useWorkspaceStore((s) => s.switchTo);
  const windows = useWindowStore((s) => s.windows);

  return (
    <div className="ws-indicator" data-testid="workspace-indicator">
      {Array.from({ length: WORKSPACE_COUNT }, (_, i) => {
        const occupied = windows.some((w) => w.workspace === i && !w.minimized);
        return (
          <button
            key={i}
            type="button"
            className={`ws-pip${i === active ? ' ws-pip--active' : ''}`}
            data-testid="workspace-pip"
            data-ws={i}
            aria-pressed={i === active}
            title={`Workspace ${i + 1}`}
            onClick={() => switchTo(i)}
          >
            {i + 1}
            {occupied && <span className="ws-pip__dot" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
