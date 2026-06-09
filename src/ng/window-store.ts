import { Injectable, signal } from '@angular/core';
import { getApp } from './app-registry';

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
}

/**
 * Window manager for the Angular desktop. Pure signal state — no zone.js. Every
 * mutation returns a fresh array so the `@for` in the desktop re-renders. This
 * is the Angular replacement for the old React/zustand windowStore.
 */
@Injectable({ providedIn: 'root' })
export class WindowStore {
  readonly windows = signal<Win[]>([]);
  private seq = 0;
  private topZ = 1;

  open(appId: string): string {
    const app = getApp(appId);
    if (!app) return '';
    const id = `win-${++this.seq}`;
    const z = ++this.topZ;
    const offset = (this.windows().length % 6) * 28;
    const win: Win = {
      id,
      appId,
      title: app.title,
      icon: app.icon,
      x: 140 + offset,
      y: 90 + offset,
      w: app.defaultSize.w,
      h: app.defaultSize.h,
      z,
      focused: true,
      workspace: 0,
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

  close(id: string): void {
    this.windows.update((ws) => ws.filter((w) => w.id !== id));
  }
}
