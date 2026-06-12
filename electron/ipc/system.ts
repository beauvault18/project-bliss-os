import { BrowserWindow, type IpcMain } from 'electron';
import os from 'node:os';
import { CH, type SystemStats } from './channels';
import type { IpcContext } from './index';

/**
 * System telemetry + fullscreen handlers — the original four v1 channels.
 *
 * CPU load is not an instantaneous quantity: `os.cpus()` reports cumulative
 * jiffy counters since boot, so we diff against the previous sample and report
 * load over the interval between calls. The consumers' polling cadence IS the
 * sampling window.
 */
export function registerSystem(ipcMain: IpcMain, ctx: IpcContext): void {
  let prevTimes = os.cpus().map((c) => ({ ...c.times }));

  ipcMain.handle(CH.systemStats, (): SystemStats => {
    const cpus = os.cpus();
    const cores = cpus.map((c, i) => {
      const p = prevTimes[i] ?? c.times;
      const t = c.times;
      const idle = t.idle - p.idle;
      const total =
        t.user - p.user + (t.nice - p.nice) + (t.sys - p.sys) + idle + (t.irq - p.irq);
      return total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : 0;
    });
    prevTimes = cpus.map((c) => ({ ...c.times }));
    const totalmem = os.totalmem();
    const freemem = os.freemem();
    return {
      cores, // per-core load %
      cpu: cores.reduce((a, b) => a + b, 0) / (cores.length || 1),
      ramUsed: totalmem - freemem,
      ramTotal: totalmem,
    };
  });

  /** Resolve the window that issued the call, falling back to the app's main
   *  window — correct by construction even if the app grows more windows. */
  const senderWin = (e: Electron.IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(e.sender) ?? ctx.getMainWindow();

  ipcMain.handle(CH.toggleFullscreen, (e) => {
    const win = senderWin(e);
    if (!win) return false;
    win.setFullScreen(!win.isFullScreen());
    return win.isFullScreen();
  });
  ipcMain.handle(CH.setFullscreen, (e, value: unknown) => {
    const win = senderWin(e);
    if (!win) return false;
    win.setFullScreen(!!value);
    return win.isFullScreen();
  });
  ipcMain.handle(CH.isFullscreen, (e) => {
    const win = senderWin(e);
    return win ? win.isFullScreen() : false;
  });
}
