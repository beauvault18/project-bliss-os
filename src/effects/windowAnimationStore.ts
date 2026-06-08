import { create } from 'zustand';
import { useWindowStore } from '../core/windowStore';
import { usePreferencesStore } from '../core/preferencesStore';
import {
  DEFAULT_MINIMIZE_PRESET,
  CLOSE_PRESET,
  QUIT_PRESET,
  getMinimizePreset,
} from '../core/animationPresets';
import { tokenSlotPosition, TOKEN_W, TOKEN_H } from '../core/tokenLayout';
import type { Rect } from './minimizeEffects';

export type AnimStatus = 'minimizing' | 'restoring' | 'closing' | 'quitting';

export interface WindowAnim {
  status: AnimStatus;
  presetId: string;
  /** Genie target (minimize/restore only). */
  target?: Rect;
  /** App id (close/quit only — needed to quit the app). */
  appId?: string;
}

interface AnimStore {
  anims: Record<string, WindowAnim>;
  startMinimize: (id: string, target: Rect, presetId: string) => void;
  startRestore: (id: string, target: Rect, presetId: string) => void;
  startClose: (id: string, appId: string, presetId: string) => void;
  startQuit: (id: string, appId: string, presetId: string) => void;
  clear: (id: string) => void;
}

export const useWindowAnimationStore = create<AnimStore>((set) => ({
  anims: {},
  startMinimize: (id, target, presetId) =>
    set((s) => ({
      anims: { ...s.anims, [id]: { status: 'minimizing', target, presetId } },
    })),
  startRestore: (id, target, presetId) =>
    set((s) => ({
      anims: { ...s.anims, [id]: { status: 'restoring', target, presetId } },
    })),
  startClose: (id, appId, presetId) =>
    set((s) => ({
      anims: { ...s.anims, [id]: { status: 'closing', appId, presetId } },
    })),
  startQuit: (id, appId, presetId) =>
    set((s) => ({
      anims: { ...s.anims, [id]: { status: 'quitting', appId, presetId } },
    })),
  clear: (id) =>
    set((s) => {
      if (!s.anims[id]) return s;
      const anims = { ...s.anims };
      delete anims[id];
      return { anims };
    }),
}));

/** Screen-space rect of an app's taskbar button (the genie target). */
function taskbarTarget(appId: string): Rect {
  const el = document.querySelector(
    `[data-testid="task-button"][data-appid="${appId}"]`,
  );
  if (el) {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }
  // Fallback: bottom-center (above the taskbar).
  return {
    x: window.innerWidth / 2 - 45,
    y: window.innerHeight - 36,
    w: 90,
    h: 28,
  };
}

/** Where a minimize should land: the taskbar button, or a desktop token slot. */
function minimizeTarget(appId: string, preset: { landsOnDesktop?: boolean }): Rect {
  if (!preset.landsOnDesktop) return taskbarTarget(appId);
  const wins = useWindowStore.getState().windows;
  const slot = wins.filter((w) => w.minimized && w.tokenPos).length;
  const pos = tokenSlotPosition(slot, {
    w: window.innerWidth,
    h: window.innerHeight,
  });
  return { x: pos.x, y: pos.y, w: TOKEN_W, h: TOKEN_H };
}

/** Begin a minimize animation (taskbar genie or desktop token); commit on finish. */
export function animatedMinimize(
  id: string,
  appId: string,
  presetId = usePreferencesStore.getState().minimizePreset || DEFAULT_MINIMIZE_PRESET,
): void {
  if (useWindowAnimationStore.getState().anims[id]) return; // already animating
  const target = minimizeTarget(appId, getMinimizePreset(presetId));
  useWindowAnimationStore.getState().startMinimize(id, target, presetId);
}

/**
 * Begin a restore animation: render the window, then expand it from wherever it
 * was minimized to (taskbar button or desktop token), reversing the same preset.
 */
export function animatedRestore(id: string, appId: string): void {
  if (useWindowAnimationStore.getState().anims[id]) return;
  const win = useWindowStore.getState().windows.find((w) => w.id === id);
  const presetId =
    win?.minimizedWith ||
    usePreferencesStore.getState().restorePreset ||
    DEFAULT_MINIMIZE_PRESET;
  const target = win?.tokenPos
    ? { x: win.tokenPos.x, y: win.tokenPos.y, w: TOKEN_W, h: TOKEN_H }
    : taskbarTarget(appId);
  // Set the anim FIRST so WindowView's first render (after un-minimizing) starts
  // pinned at collapsed (progress 0) — avoids a full-size flash.
  useWindowAnimationStore.getState().startRestore(id, target, presetId);
  useWindowStore.getState().focus(id); // un-minimizes (clears token), raises z
}

/**
 * Close a window with the ember burn — the app stays running. The window is
 * removed only when the burn finishes (committed in WindowView's onRest).
 */
export function animatedClose(id: string, appId: string): void {
  if (useWindowAnimationStore.getState().anims[id]) return;
  if (!usePreferencesStore.getState().fireEffects) {
    useWindowStore.getState().closeWindow(id);
    return;
  }
  useWindowAnimationStore.getState().startClose(id, appId, CLOSE_PRESET);
}

/** Quit an app with the dramatic fire burn — clears the running indicator. */
export function animatedQuit(id: string, appId: string): void {
  if (useWindowAnimationStore.getState().anims[id]) return;
  if (!usePreferencesStore.getState().fireEffects) {
    useWindowStore.getState().quitApp(appId);
    return;
  }
  useWindowAnimationStore.getState().startQuit(id, appId, QUIT_PRESET);
}
