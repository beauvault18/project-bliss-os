import { create } from 'zustand';
import type { WindowState } from './types';
import { getApp } from './appRegistry';

interface WindowStore {
  windows: WindowState[];
  topZ: number;
  seq: number;
  open: (appId: string) => string;
  close: (id: string) => void;
  focus: (id: string) => void;
  move: (id: string, dx: number, dy: number) => void;
  setPos: (id: string, x: number, y: number) => void;
  resize: (id: string, w: number, h: number) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  toggleMaximize: (id: string, viewport: { w: number; h: number }) => void;
}

const TASKBAR_H = 40;

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: [],
  topZ: 1,
  seq: 0,

  open: (appId) => {
    const app = getApp(appId);
    if (!app) return '';
    const s = get();
    const id = `win-${s.seq + 1}`;
    const z = s.topZ + 1;
    // Cascade new windows so they don't stack perfectly.
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
    };
    set({
      windows: [...s.windows.map((w) => ({ ...w, focused: false })), win],
      topZ: z,
      seq: s.seq + 1,
    });
    return id;
  },

  close: (id) =>
    set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),

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

  minimize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, minimized: true, focused: false } : w,
      ),
    })),

  restore: (id) => get().focus(id),

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
}));
