import { contextBridge, ipcRenderer } from 'electron';

// Minimal, safe bridge. Extend this to expose IPC channels to the renderer.
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // Live system telemetry (real CPU/RAM from the main process).
  getSystemStats: (): Promise<{
    cores: number[];
    cpu: number;
    ramUsed: number;
    ramTotal: number;
  }> => ipcRenderer.invoke('get-system-stats'),
  // Full-screen demo mode. Returns the resulting fullscreen state.
  toggleFullscreen: (): Promise<boolean> =>
    ipcRenderer.invoke('window:toggle-fullscreen'),
  setFullscreen: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke('window:set-fullscreen', value),
  isFullscreen: (): Promise<boolean> =>
    ipcRenderer.invoke('window:is-fullscreen'),
});
