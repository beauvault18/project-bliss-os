import { inject, Injectable, signal } from '@angular/core';
import { getApp } from './app-registry';
import { WorkspaceStore } from './workspace-store';

export interface Win {
  id: string;
  appId: string;
  title: string;
  icon: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  focused: boolean;
  /** Virtual desktop (cube face) this window lives on. */
  workspace: number;
  /** Compiz wobble: live skew distortion (deg), driven by drag velocity. */
  skewX: number;
  skewY: number;
  /** Genie-minimized: held collapsed into the taskbar, still alive in the store. */
  minimized: boolean;
  /** Fire-closing: playing the incineration before removal (locks interaction). */
  closing: boolean;
  /** Maximized to fill the workspace; prevGeom holds the size to restore to. */
  maximized: boolean;
  prevGeom: { x: number; y: number; w: number; h: number } | null;
  /** Launch parameters handed to the app component via WINDOW_PARAMS. */
  params: Record<string, unknown>;
  /** Always-on-top: rendered above every unpinned window on its face. */
  pinned: boolean;
}

/** Smallest a window can be dragged down to when resizing. */
export const MIN_WIN_W = 200;
export const MIN_WIN_H = 140;

/** Optional placement overrides for {@link WindowStore.open}. */
export interface OpenOpts {
  workspace?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  title?: string;
  /** Launch parameters for the app component (WINDOW_PARAMS token). */
  params?: Record<string, unknown>;
}

/**
 * Window manager for the Angular desktop. Pure signal state — no zone.js. Every
 * mutation returns a fresh array so the `@for` in the desktop re-renders. This
 * is the Angular replacement for the old React/zustand windowStore.
 */
@Injectable({ providedIn: 'root' })
export class WindowStore {
  readonly windows = signal<Win[]>([]);
  /** A restore (un-minimize) request from the taskbar; the desktop watches this
   *  and plays the reverse-genie, then clears it. Null = nothing pending. */
  readonly restoreReq = signal<string | null>(null);
  /** Taskbar peek: while set, every OTHER window on the face dims so the
   *  hovered task's window stands out. Transient UI state — never persisted. */
  readonly peekId = signal<string | null>(null);
  private workspaces = inject(WorkspaceStore);
  private seq = 0;
  private topZ = 1;

  open(appId: string, opts?: OpenOpts): string {
    const app = getApp(appId);
    if (!app) return '';
    if (app.singleton) {
      // Singleton apps (Control Center) never duplicate — focus the live one.
      const existing = this.windows().find((w) => w.appId === appId);
      if (existing) {
        this.focus(existing.id);
        return existing.id;
      }
    }
    const id = `win-${++this.seq}`;
    const z = ++this.topZ;
    const offset = (this.windows().length % 6) * 28;
    const win: Win = {
      id,
      appId,
      title: opts?.title ?? app.title,
      icon: app.icon,
      x: opts?.x ?? 140 + offset,
      y: opts?.y ?? 90 + offset,
      w: opts?.w ?? app.defaultSize.w,
      h: opts?.h ?? app.defaultSize.h,
      z,
      focused: true,
      workspace: opts?.workspace ?? this.workspaces.active(),
      skewX: 0,
      skewY: 0,
      minimized: false,
      closing: false,
      maximized: false,
      prevGeom: null,
      params: opts?.params ?? {},
      pinned: false,
    };
    this.windows.update((ws) => [...ws.map((w) => ({ ...w, focused: false })), win]);
    return id;
  }

  openOrFocus(appId: string): string {
    const existing = this.windows().filter((w) => w.appId === appId);
    if (existing.length) {
      const top = existing.reduce((a, b) => (a.z >= b.z ? a : b));
      this.focus(top.id);
      return top.id;
    }
    return this.open(appId);
  }

  focus(id: string): void {
    const z = ++this.topZ;
    this.windows.update((ws) =>
      ws.map((w) => (w.id === id ? { ...w, focused: true, z } : { ...w, focused: false })),
    );
  }

  move(id: string, x: number, y: number): void {
    this.windows.update((ws) =>
      ws.map((w) => (w.id === id ? { ...w, x, y: Math.max(0, y) } : w)),
    );
  }

  /** Resize a window (drag-handle), clamped to the minimum size. */
  resize(id: string, w: number, h: number): void {
    this.windows.update((ws) =>
      ws.map((win) =>
        win.id === id
          ? { ...win, w: Math.max(MIN_WIN_W, w), h: Math.max(MIN_WIN_H, h) }
          : win,
      ),
    );
  }

  /**
   * Maximize a window to the given bounds (saving its current geometry), or
   * restore it. Resizing/dragging a maximized window clears the flag.
   */
  toggleMaximize(id: string, bounds: { x: number; y: number; w: number; h: number }): void {
    this.windows.update((ws) =>
      ws.map((win) => {
        if (win.id !== id) return win;
        if (win.maximized && win.prevGeom) {
          return { ...win, ...win.prevGeom, maximized: false, prevGeom: null };
        }
        return {
          ...win,
          prevGeom: { x: win.x, y: win.y, w: win.w, h: win.h },
          ...bounds,
          maximized: true,
        };
      }),
    );
  }

  /** Drop the maximized flag without changing geometry (e.g. on manual drag/resize). */
  unmaximize(id: string): void {
    this.windows.update((ws) =>
      ws.map((w) => (w.id === id && w.maximized ? { ...w, maximized: false, prevGeom: null } : w)),
    );
  }

  /** Set a window's wobble skew (deg). Driven by the drag loop's velocity and
   *  by the snap-back spring on release. */
  setSkew(id: string, skewX: number, skewY: number): void {
    this.windows.update((ws) =>
      ws.map((w) => (w.id === id ? { ...w, skewX, skewY } : w)),
    );
  }

  /** Mark a window minimized (true after the genie suck-in, false on restore). */
  setMinimized(id: string, minimized: boolean): void {
    this.windows.update((ws) =>
      ws.map((w) => (w.id === id ? { ...w, minimized } : w)),
    );
  }

  /** Flag a window as incinerating so it locks while the fire-close plays. The
   *  actual removal is {@link close}, called when the animation finishes. */
  setClosing(id: string): void {
    this.windows.update((ws) =>
      ws.map((w) => (w.id === id ? { ...w, closing: true } : w)),
    );
  }

  /** Ask the desktop to restore (reverse-genie) a minimized window. */
  requestRestore(id: string): void {
    this.restoreReq.set(id);
  }

  /** Clear a handled restore request. */
  endRestore(): void {
    this.restoreReq.set(null);
  }

  close(id: string): void {
    this.windows.update((ws) => ws.filter((w) => w.id !== id));
  }

  /** Toggle always-on-top. Render order adds a large z offset for pinned
   *  windows (the z counter itself is never mutated). */
  togglePin(id: string): void {
    this.windows.update((ws) =>
      ws.map((w) => (w.id === id ? { ...w, pinned: !w.pinned } : w)),
    );
  }

  /** Snap to a screen region (half/quarter): plain geometry commit — the
   *  desktop adds a transient CSS transition class for the glide. */
  snapTo(id: string, bounds: { x: number; y: number; w: number; h: number }): void {
    this.windows.update((ws) =>
      ws.map((w) =>
        w.id === id
          ? { ...w, ...bounds, maximized: false, prevGeom: null }
          : w,
      ),
    );
  }

  /** Reassign a window to another workspace (visibility-only move). */
  moveToWorkspace(id: string, workspace: number): void {
    this.windows.update((ws) =>
      ws.map((w) => (w.id === id ? { ...w, workspace, focused: false } : w)),
    );
  }

  /**
   * Carry a window to another workspace during an edge-flip drag, keeping it
   * focused and on top. Unlike {@link moveToWorkspace}, position is left to the
   * drag loop, which keeps the window glued to the cursor on the new face.
   */
  dragToWorkspace(id: string, workspace: number): void {
    const z = ++this.topZ;
    this.windows.update((ws) =>
      ws.map((w) => (w.id === id ? { ...w, workspace, focused: true, z } : { ...w, focused: false })),
    );
  }
}
