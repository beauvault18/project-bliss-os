import { useThree } from '@react-three/fiber';
import { useWindowStore } from '../core/windowStore';
import {
  useOverviewStore,
  computeOverviewSlots,
} from '../core/overviewStore';
import { useWorkspaceStore } from '../core/workspaceStore';
import { WindowView } from '../windows/WindowView';

/**
 * Renders one <WindowView> per non-minimized window on the ACTIVE workspace.
 * Windows on other workspaces still exist in the store — they're just hidden
 * here until their workspace becomes active again.
 */
export function WindowLayer() {
  const windows = useWindowStore((s) => s.windows);
  const overview = useOverviewStore((s) => s.active);
  const selectedIndex = useOverviewStore((s) => s.selectedIndex);
  const activeWorkspace = useWorkspaceStore((s) => s.active);
  const { width, height } = useThree((s) => s.size);

  const vis = windows.filter(
    (w) => !w.minimized && w.workspace === activeWorkspace,
  );
  const slots = overview
    ? computeOverviewSlots(vis, { w: width, h: height })
    : [];

  return (
    <>
      {vis.map((w, i) => (
        <WindowView
          key={w.id}
          win={w}
          index={i}
          overview={overview}
          slot={overview ? slots[i] : null}
          selected={overview && i === selectedIndex}
        />
      ))}
    </>
  );
}
