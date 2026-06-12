import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { registerSystem } from './system';
import { registerStore } from './store';
import { registerFs } from './fs';
import { registerDialog } from './dialog';
import { registerAi } from './ai';
import { registerMarket } from './market';

/**
 * Shared IPC registration, consumed by BOTH real main processes:
 *   - `electron/main.ts` (the app) imports and calls `registerAllIpc(ctx)`
 *   - `scripts/smoke.cjs` (the headless harness) requires the built
 *     `dist-electron/ipc.js` and calls the same function
 * so the handlers under test are byte-identical to the handlers that ship.
 * This module is built as its own bundle (third vite-plugin-electron entry).
 */
export interface IpcContext {
  /** The app's primary window, used as the fallback target for window-state
   *  channels when the sender can't be resolved. */
  getMainWindow: () => BrowserWindow | null;
}

export function registerAllIpc(ctx: IpcContext): void {
  registerSystem(ipcMain, ctx);
  registerStore(ipcMain);
  registerFs(ipcMain);
  registerDialog(ipcMain, ctx);
  registerAi(ipcMain, ctx);
  registerMarket(ipcMain);
}
