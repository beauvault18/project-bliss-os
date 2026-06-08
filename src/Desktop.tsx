import { useEffect, useState } from 'react';
import { DesktopScene } from './scene/DesktopScene';
import { LivingParallaxDesktop } from './scene/LivingParallaxDesktop';
import { DesktopIcons } from './shell/DesktopIcons';
import { DesktopProcessTokens } from './shell/DesktopProcessTokens';
import { Taskbar } from './shell/Taskbar';
import { StartMenu } from './shell/StartMenu';
import { WindowOverview } from './shell/WindowOverview';
import { useWindowStore } from './core/windowStore';
import { usePreferencesStore } from './core/preferencesStore';
import { useOverviewStore } from './core/overviewStore';
import {
  useWindowAnimationStore,
  animatedMinimize,
  animatedRestore,
} from './effects/windowAnimationStore';

export function Desktop() {
  const [startOpen, setStartOpen] = useState(false);
  const showDesktopIcons = usePreferencesStore((s) => s.showDesktopIcons);

  // Full-screen demo mode: F11 toggles, Esc exits (after closing menus).
  // The Rapid Control / Start menus stop Esc propagation while open, so this
  // only exits fullscreen when nothing else needs to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ov = useOverviewStore.getState();

      // Ctrl/Cmd+Space toggles the cinematic window overview.
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault();
        ov.toggle();
        return;
      }

      // While overview is open it owns the keyboard.
      if (ov.active) {
        const vis = useWindowStore.getState().windows.filter((w) => !w.minimized);
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          ov.close();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const w = vis[ov.selectedIndex];
          if (w) {
            ov.close();
            useWindowStore.getState().focus(w.id);
          }
        } else if (e.key.startsWith('Arrow')) {
          e.preventDefault();
          const delta =
            e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
          ov.moveSelection(delta, vis.length);
        }
        return;
      }

      if (e.key === 'F11') {
        e.preventDefault();
        void window.electronAPI?.toggleFullscreen();
      } else if (e.key === 'Escape') {
        if (startOpen) {
          setStartOpen(false);
        } else {
          void window.electronAPI?.setFullscreen(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startOpen]);

  // Debug hook for headless smoke tests (drive/inspect the window manager).
  useEffect(() => {
    const s = () => useWindowStore.getState();
    (window as unknown as { __bliss: unknown }).__bliss = {
      open: (id: string) => s().open(id),
      openOrFocus: (id: string) => s().openOrFocus(id),
      closeWindow: (id: string) => s().closeWindow(id),
      quitApp: (appId: string) => s().quitApp(appId),
      focus: (id: string) => s().focus(id),
      minimize: (id: string) => s().minimize(id),
      move: (id: string, dx: number, dy: number) => s().move(id, dx, dy),
      dock: (id: string, side: 'left' | 'right', vp: { w: number; h: number }) =>
        s().dock(id, side, vp),
      setOpacity: (id: string, o: number) => s().setOpacity(id, o),
      minimizeAnimated: (id: string, appId: string) => animatedMinimize(id, appId),
      restoreAnimated: (id: string, appId: string) => animatedRestore(id, appId),
      animStatus: (id: string) =>
        useWindowAnimationStore.getState().anims[id]?.status ?? null,
      prefs: () => usePreferencesStore.getState(),
      setPrefs: (patch: Record<string, unknown>) =>
        usePreferencesStore.getState().update(patch as never),
      resetPrefs: () => usePreferencesStore.getState().reset(),
      openOverview: () => useOverviewStore.getState().open(),
      closeOverview: () => useOverviewStore.getState().close(),
      overviewActive: () => useOverviewStore.getState().active,
      windows: () => s().windows,
      running: () => Object.keys(s().running),
    };
  }, []);

  return (
    <div className="desktop">
      <DesktopScene />
      <LivingParallaxDesktop />
      {showDesktopIcons && <DesktopIcons />}
      <DesktopProcessTokens />
      <WindowOverview />
      {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}
      <Taskbar
        startOpen={startOpen}
        onToggleStart={() => setStartOpen((o) => !o)}
      />
    </div>
  );
}
