import { create } from 'zustand';
import { usePreferencesStore } from './preferencesStore';
import { useOverviewStore } from './overviewStore';

/** Number of virtual desktops (cube faces). */
export const WORKSPACE_COUNT = 4;

/** Cosmetic cube transition: which face we're rotating from → to. */
export interface CubeSpin {
  from: number;
  to: number;
}

interface WorkspaceStore {
  /** Active workspace index, 0..WORKSPACE_COUNT-1 ("Workspace 1" == index 0). */
  active: number;
  /** Non-null while the cube rotation is playing (purely visual). */
  spin: CubeSpin | null;
  switchTo: (index: number) => void;
  next: () => void;
  prev: () => void;
  endSpin: () => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  active: 0,
  spin: null,

  // Change the active workspace. This flips window VISIBILITY only — no window
  // is created, moved, or destroyed. Plays a cube transition unless disabled.
  switchTo: (index) => {
    const { active } = get();
    if (index === active || index < 0 || index >= WORKSPACE_COUNT) return;
    // The overview and the cube must never be on screen together.
    useOverviewStore.getState().close();
    if (usePreferencesStore.getState().cubeEnabled) {
      set({ active: index, spin: { from: active, to: index } });
    } else {
      set({ active: index, spin: null });
    }
  },

  next: () => get().switchTo((get().active + 1) % WORKSPACE_COUNT),
  prev: () =>
    get().switchTo((get().active + WORKSPACE_COUNT - 1) % WORKSPACE_COUNT),

  endSpin: () => set({ spin: null }),
}));
