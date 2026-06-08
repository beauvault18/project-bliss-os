import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';

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

// --- Full-screen demo mode IPC ------------------------------------------
ipcMain.handle('window:toggle-fullscreen', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender) ?? mainWindow;
  if (!win) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});
ipcMain.handle('window:set-fullscreen', (e, value: boolean) => {
  const win = BrowserWindow.fromWebContents(e.sender) ?? mainWindow;
  if (!win) return false;
  win.setFullScreen(!!value);
  return win.isFullScreen();
});
ipcMain.handle('window:is-fullscreen', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender) ?? mainWindow;
  return win ? win.isFullScreen() : false;
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
