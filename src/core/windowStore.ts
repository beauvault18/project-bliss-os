import { create } from 'zustand';
import type { WindowState } from './types';
import { getApp } from './appRegistry';
import { usePreferencesStore } from './preferencesStore';

type DockSide = 'left' | 'right';

interface WindowStore {
  windows: WindowState[];
  /** Apps considered "running" even with no visible window (taskbar dot). */
  running: Record<string, true>;
  topZ: number;
  seq: number;
  open: (appId: string) => string;
  openOrFocus: (appId: string) => string;
  closeWindow: (id: string) => void;
  quitApp: (appId: string) => void;
  focus: (id: string) => void;
  move: (id: string, dx: number, dy: number) => void;
  setPos: (id: string, x: number, y: number) => void;
  resize: (id: string, w: number, h: number) => void;
  setOpacity: (id: string, opacity: number) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  dock: (id: string, side: DockSide, viewport: { w: number; h: number }) => void;
  toggleMaximize: (id: string, viewport: { w: number; h: number }) => void;
  resetLayout: () => void;
}

const TASKBAR_H = 40;

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: [],
  running: {},
  topZ: 1,
  seq: 0,

  open: (appId) => {
    const app = getApp(appId);
    if (!app) return '';
    const s = get();
    const id = `win-${s.seq + 1}`;
    const z = s.topZ + 1;
    const offset = (s.windows.length % 6) * 28;
    const win: WindowState = {
      id,
      appId,
      title: app.title,
      x: 120 + offset,
      y: 90 + offset,
      w: app.defaultSize.w,
      h: app.defaultSize.h,
      z,
      focused: true,
      minimized: false,
      maximized: false,
      opacity: usePreferencesStore.getState().defaultOpacity,
    };
    set({
      windows: [...s.windows.map((w) => ({ ...w, focused: false })), win],
      running: { ...s.running, [appId]: true },
      topZ: z,
      seq: s.seq + 1,
    });
    return id;
  },

  // Launch the app, or focus an existing window for it (no duplicates).
  openOrFocus: (appId) => {
    const s = get();
    const existing = s.windows.filter((w) => w.appId === appId);
    if (existing.length) {
      const top = existing.reduce((a, b) => (a.z >= b.z ? a : b));
      s.focus(top.id);
      return top.id;
    }
    return s.open(appId);
  },

  // Remove the visible window; the app stays "running" (dot persists).
  closeWindow: (id) =>
    set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),

  // Fully end the app: remove all its windows and clear its running flag.
  quitApp: (appId) =>
    set((s) => {
      const running = { ...s.running };
      delete running[appId];
      return { windows: s.windows.filter((w) => w.appId !== appId), running };
    }),

  focus: (id) =>
    set((s) => {
      const z = s.topZ + 1;
      return {
        topZ: z,
        windows: s.windows.map((w) =>
          w.id === id
            ? { ...w, focused: true, z, minimized: false }
            : { ...w, focused: false },
        ),
      };
    }),

  move: (id, dx, dy) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, x: w.x + dx, y: Math.max(0, w.y + dy) } : w,
      ),
    })),

  setPos: (id, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, x, y: Math.max(0, y) } : w,
      ),
    })),

  resize: (id, w, h) =>
    set((s) => ({
      windows: s.windows.map((win) =>
        win.id === id
          ? { ...win, w: Math.max(220, w), h: Math.max(140, h) }
          : win,
      ),
    })),

  setOpacity: (id, opacity) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id
          ? { ...w, opacity: Math.max(0.2, Math.min(1, opacity)) }
          : w,
      ),
    })),

  minimize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, minimized: true, focused: false } : w,
      ),
    })),

  restore: (id) => get().focus(id),

  dock: (id, side, viewport) =>
    set((s) => {
      const z = s.topZ + 1;
      const w = Math.round(viewport.w / 2);
      const h = viewport.h - TASKBAR_H;
      const x = side === 'left' ? 0 : viewport.w - w;
      return {
        topZ: z,
        windows: s.windows.map((win) =>
          win.id === id
            ? { ...win, x, y: 0, w, h, z, maximized: false, focused: true }
            : { ...win, focused: false },
        ),
      };
    }),

  toggleMaximize: (id, viewport) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w;
        if (w.maximized && w.restore) {
          return { ...w, maximized: false, ...w.restore, restore: undefined };
        }
        return {
          ...w,
          maximized: true,
          restore: { x: w.x, y: w.y, w: w.w, h: w.h },
          x: 0,
          y: 0,
          w: viewport.w,
          h: viewport.h - TASKBAR_H,
        };
      }),
    })),

  // Re-tile every open window to a clean cascade (non-destructive: nothing closes).
  resetLayout: () =>
    set((s) => ({
      windows: s.windows.map((w, i) => {
        const app = getApp(w.appId);
        const offset = (i % 6) * 28;
        return {
          ...w,
          x: 120 + offset,
          y: 90 + offset,
          w: app?.defaultSize.w ?? w.w,
          h: app?.defaultSize.h ?? w.h,
          maximized: false,
          minimized: false,
          restore: undefined,
        };
      }),
    })),
}));
