import { BrowserWindow, dialog, type IpcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { isString } from './validate';
import type { IpcContext } from './index';

/**
 * Consent-gated file open/save for Notepad. The security boundary is the
 * native dialog: the MAIN process does all file I/O, and the renderer can
 * only ever read/write a path the user explicitly picked. Re-saving without
 * a dialog is allowed only for paths granted earlier in this session (the
 * consent allowlist); everything else routes back through Save As.
 */

export const DIALOG_CH = {
  openFile: 'dialog:open-file',
  saveFile: 'dialog:save-file',
} as const;

const MAX_OPEN_BYTES = 1024 * 1024;

export function registerDialog(ipcMain: IpcMain, ctx: IpcContext): void {
  /** Paths the user has consented to (via open or save-as) this session. */
  const consented = new Set<string>();

  const ownerWin = (e: Electron.IpcMainInvokeEvent) =>
    BrowserWindow.fromWebContents(e.sender) ?? ctx.getMainWindow() ?? undefined;

  ipcMain.handle(
    DIALOG_CH.openFile,
    async (e): Promise<{ path: string; name: string; content: string } | null> => {
      const win = ownerWin(e);
      const res = win
        ? await dialog.showOpenDialog(win, {
            properties: ['openFile'],
            filters: [
              { name: 'Text', extensions: ['txt', 'md', 'json', 'js', 'ts', 'css', 'html', 'log'] },
              { name: 'All Files', extensions: ['*'] },
            ],
          })
        : await dialog.showOpenDialog({ properties: ['openFile'] });
      if (res.canceled || !res.filePaths[0]) return null;
      const file = res.filePaths[0];
      try {
        const st = fs.statSync(file);
        if (st.size > MAX_OPEN_BYTES) return { path: file, name: path.basename(file), content: '' };
        const buf = fs.readFileSync(file);
        if (buf.includes(0)) return null; // binary — Notepad can't show it
        consented.add(file);
        return { path: file, name: path.basename(file), content: buf.toString('utf8') };
      } catch {
        return null;
      }
    },
  );

  ipcMain.handle(
    DIALOG_CH.saveFile,
    async (e, req: unknown): Promise<{ path: string; name: string } | null> => {
      if (!req || typeof req !== 'object') return null;
      const { path: reqPath, content } = req as { path?: unknown; content?: unknown };
      if (!isString(content)) return null;
      let target: string | null = null;
      if (isString(reqPath) && consented.has(reqPath)) {
        // Quiet re-save to a previously consented path (Ctrl+S).
        target = reqPath;
      } else {
        const win = ownerWin(e);
        const res = win
          ? await dialog.showSaveDialog(win, { defaultPath: isString(reqPath) ? reqPath : undefined })
          : await dialog.showSaveDialog({});
        if (res.canceled || !res.filePath) return null;
        target = res.filePath;
      }
      try {
        fs.writeFileSync(target, content, 'utf8');
        consented.add(target);
        return { path: target, name: path.basename(target) };
      } catch {
        return null;
      }
    },
  );
}
