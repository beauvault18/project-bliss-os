import type { WindowStore } from './window-store';

/** The canonical demo layout: 6 cyberpunk apps across the 4 cube faces. Used
 *  by the boot seed (fresh profile) and by Settings' "Reset layout". The
 *  smoke harness asserts this exact placement. */
export function seedDemoLayout(store: WindowStore): void {
  // Workspace 0 — Math & Logic Terminal
  store.open('fractal-engine', { workspace: 0, x: 30, y: 50, w: 600, h: 480 });
  store.open('system-terminal', { workspace: 0, x: 30, y: 550, w: 800, h: 360 });
  // Workspace 1 — Space Simulation & Market Analytics
  store.open('space-tracker', { workspace: 1, x: 50, y: 50, w: 700, h: 400 });
  store.open('market-charts', { workspace: 1, x: 50, y: 480, w: 700, h: 430 });
  // Workspace 2 — Media Stream Engine
  store.open('media-streamer', { workspace: 2, x: 150, y: 100, w: 800, h: 500 });
  // Workspace 3 — Diagnostics Panel
  store.open('diagnostics', { workspace: 3, x: 40, y: 80, w: 900, h: 600 });
}
