import { create } from 'zustand';
import type { WindowState } from './types';

export interface OverviewSlot {
  cx: number; // target center x (screen px)
  cy: number; // target center y (screen px)
  scale: number; // scale to fit the grid cell
}

interface OverviewStore {
  active: boolean;
  selectedIndex: number;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setSelectedIndex: (i: number) => void;
  moveSelection: (delta: number, count: number) => void;
}

export const useOverviewStore = create<OverviewStore>((set) => ({
  active: false,
  selectedIndex: 0,
  open: () => set({ active: true, selectedIndex: 0 }),
  close: () => set({ active: false }),
  toggle: () => set((s) => ({ active: !s.active, selectedIndex: 0 })),
  setSelectedIndex: (i) => set({ selectedIndex: i }),
  moveSelection: (delta, count) =>
    set((s) => ({
      selectedIndex: count ? (s.selectedIndex + delta + count) % count : 0,
    })),
}));

/**
 * Lay the given (non-minimized) windows into a centered grid of cells. Returns
 * one slot per window — a target CENTER and a scale-to-fit. This is purely
 * visual: the windows' real x/y/w/h are never changed.
 */
export function computeOverviewSlots(
  windows: WindowState[],
  viewport: { w: number; h: number },
): OverviewSlot[] {
  const n = windows.length;
  if (!n) return [];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const padX = 48;
  const top = 64;
  const taskbar = 40;
  const bottom = 36;
  const areaW = viewport.w - padX * 2;
  const areaH = viewport.h - top - taskbar - bottom;
  const cellW = areaW / cols;
  const cellH = areaH / rows;

  return windows.map((w, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = padX + cellW * (col + 0.5);
    const cy = top + cellH * (row + 0.5);
    const scale = Math.min(
      (cellW * 0.86) / w.w,
      (cellH * 0.8) / w.h,
      1,
    );
    return { cx, cy, scale };
  });
}
