import { useWindowStore } from '../core/windowStore';
import { WindowView } from '../windows/WindowView';

/** Renders one <WindowView> per non-minimized window, inside the R3F scene. */
export function WindowLayer() {
  const windows = useWindowStore((s) => s.windows);
  return (
    <>
      {windows
        .filter((w) => !w.minimized)
        .map((w) => (
          <WindowView key={w.id} win={w} />
        ))}
    </>
  );
}
