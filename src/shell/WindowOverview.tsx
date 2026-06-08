import { useOverviewStore } from '../core/overviewStore';
import { usePreferencesStore } from '../core/preferencesStore';

/**
 * The Mission Control backdrop: dims the desktop and catches background clicks
 * (to close). The window cards themselves render in the R3F layer above this.
 */
export function WindowOverview() {
  const active = useOverviewStore((s) => s.active);
  const close = useOverviewStore((s) => s.close);
  const dim = usePreferencesStore((s) => s.overviewDim);
  if (!active) return null;
  return (
    <div
      className="window-overview-backdrop"
      data-testid="window-overview"
      style={{ background: `rgba(4, 8, 20, ${dim / 100})` }}
      onClick={() => close()}
    >
      <div className="window-overview__hint">
        Click a window · ↑↓←→ to move · Enter to open · Esc to close
      </div>
    </div>
  );
}
