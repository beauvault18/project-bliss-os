import { contextBridge } from 'electron';

// Minimal, safe bridge. Extend this to expose IPC channels to the renderer.
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
