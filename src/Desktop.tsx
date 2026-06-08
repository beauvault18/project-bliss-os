import { useEffect, useState } from 'react';
import { DesktopScene } from './scene/DesktopScene';
import { Taskbar } from './shell/Taskbar';
import { StartMenu } from './shell/StartMenu';
import { useWindowStore } from './core/windowStore';

export function Desktop() {
  const [startOpen, setStartOpen] = useState(false);

  // Debug hook for headless smoke tests (open/close/move/inspect windows).
  useEffect(() => {
    (window as unknown as { __bliss: unknown }).__bliss = {
      open: (id: string) => useWindowStore.getState().open(id),
      close: (id: string) => useWindowStore.getState().close(id),
      focus: (id: string) => useWindowStore.getState().focus(id),
      move: (id: string, dx: number, dy: number) =>
        useWindowStore.getState().move(id, dx, dy),
      windows: () => useWindowStore.getState().windows,
    };
  }, []);

  return (
    <div className="desktop">
      <DesktopScene />
      {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}
      <Taskbar
        startOpen={startOpen}
        onToggleStart={() => setStartOpen((o) => !o)}
      />
    </div>
  );
}
