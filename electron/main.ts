import { app, BrowserWindow, session, systemPreferences } from 'electron';
import path from 'node:path';
import { registerAllIpc } from './ipc/index';

// The Electron main/preload processes are bundled to CommonJS (see package.json
// has no "type": "module"), so __dirname is available as a CJS global.

// vite-plugin-electron sets this to the dev server URL while running `vite`.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#245edb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Built renderer lives in dist/ alongside dist-electron/.
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// All IPC handlers live in electron/ipc/ — a shared module that the smoke
// harness (scripts/smoke.cjs) registers from the SAME built bundle, so the
// handlers under test never drift from the handlers that ship.
registerAllIpc({ getMainWindow: () => mainWindow });

app.whenReady().then(() => {
  // Renderer permission policy: the camera (head-tracking parallax) is the
  // ONLY grantable permission; everything else is denied outright.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media');
  });
  // macOS TCC: getUserMedia alone does NOT reliably raise the OS camera
  // prompt — without this, Chromium can hand back a stream that delivers
  // zero frames. Ask explicitly while access is undetermined.
  if (process.platform === 'darwin') {
    if (systemPreferences.getMediaAccessStatus('camera') === 'not-determined') {
      void systemPreferences.askForMediaAccess('camera');
    }
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
