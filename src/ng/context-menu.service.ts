import { Injectable, signal } from '@angular/core';

export interface MenuItem {
  label: string;
  glyph?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  action?: () => void;
}

export interface OpenMenu {
  x: number;
  y: number;
  items: MenuItem[];
}

/** One overlay menu at a time, rendered by the desktop. Anyone can open it
 *  (titlebar right-click, desktop right-click, taskbar) with their own items. */
@Injectable({ providedIn: 'root' })
export class ContextMenuService {
  readonly menu = signal<OpenMenu | null>(null);

  openAt(x: number, y: number, items: MenuItem[]): void {
    // Keep the menu on-screen (estimate 230px wide, 34px per item).
    const w = 230;
    const h = items.length * 34 + 12;
    this.menu.set({
      x: Math.min(x, window.innerWidth - w - 8),
      y: Math.min(y, window.innerHeight - h - 8),
      items,
    });
  }

  close(): void {
    this.menu.set(null);
  }
}
