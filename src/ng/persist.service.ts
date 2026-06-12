import { effect, inject, Injectable } from '@angular/core';
import { WindowStore } from './window-store';
import { WorkspaceStore } from './workspace-store';
import type { SessionStateV1 } from '../electron-api';

const SAVE_DEBOUNCE_MS = 500;

/**
 * Session persistence: snapshots the window layout into session.json
 * (debounced) and rehydrates it on boot. The snapshot projects each Win down
 * to its durable fields ONLY — transient state (skew, focused, closing, z)
 * is deliberately excluded so a wobble frame can't differ from the last
 * saved snapshot and spam the disk. Window ids are never persisted; restore
 * replays through store.open() which mints fresh ids.
 */
@Injectable({ providedIn: 'root' })
export class PersistService {
  private store = inject(WindowStore);
  private ws = inject(WorkspaceStore);

  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private lastSaved = '';
  /** Writes are armed only after restoreOrSeed() has run, so the boot
   *  sequence can never overwrite a saved session with an empty layout. */
  private armed = false;

  constructor() {
    effect(() => {
      const state = this.snapshot(); // reads windows() + active() → tracked
      if (!this.armed) return;
      const json = JSON.stringify(state);
      if (json === this.lastSaved) return; // wobble/focus churn → no-op
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
        this.lastSaved = json;
        void window.electronAPI?.session?.save(state).catch(() => {});
      }, SAVE_DEBOUNCE_MS);
    });
  }

  /** Boot path: replay a saved layout if one exists, else seed the demo
   *  layout. Always leaves persistence armed afterward. */
  async restoreOrSeed(seed: () => void): Promise<void> {
    let restored = false;
    try {
      const s = await window.electronAPI?.session?.load();
      if (s && s.version === 1 && Array.isArray(s.windows) && s.windows.length > 0) {
        for (const w of s.windows) {
          const id = this.store.open(w.appId, {
            workspace: w.workspace,
            x: w.x,
            y: w.y,
            w: w.w,
            h: w.h,
            title: w.title,
          });
          if (!id) continue; // unknown appId (registry changed) — skip
          if (w.maximized) {
            // Re-apply maximization: open() used the pre-max geometry from
            // prevGeom, then toggle into the saved maximized bounds.
            if (w.prevGeom) {
              this.store.move(id, w.prevGeom.x, w.prevGeom.y);
              this.store.resize(id, w.prevGeom.w, w.prevGeom.h);
            }
            this.store.toggleMaximize(id, { x: w.x, y: w.y, w: w.w, h: w.h });
          }
          if (w.minimized) this.store.setMinimized(id, true);
          if (w.pinned) this.store.togglePin(id);
        }
        const active = typeof s.active === 'number' ? s.active : 0;
        this.ws.active.set(Math.max(0, Math.min(3, active)));
        restored = this.store.windows().length > 0;
      }
    } catch {
      /* bridge absent or corrupt state → seed */
    }
    if (!restored) seed();
    this.armed = true;
  }

  private snapshot(): SessionStateV1 {
    return {
      version: 1,
      active: this.ws.active(),
      windows: this.store
        .windows()
        .filter((w) => !w.closing)
        .map((w) => ({
          appId: w.appId,
          title: w.title,
          x: w.x,
          y: w.y,
          w: w.w,
          h: w.h,
          workspace: w.workspace,
          minimized: w.minimized,
          maximized: w.maximized,
          prevGeom: w.prevGeom,
          pinned: w.pinned,
        })),
    };
  }
}
