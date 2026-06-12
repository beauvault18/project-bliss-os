import { contextBridge, ipcRenderer } from 'electron';

/**
 * The single privileged bridge. The renderer NEVER sees ipcRenderer itself —
 * only these named wrappers — so it can invoke exactly the whitelisted
 * channels and nothing else. v1 methods stay flat (the smoke harness and the
 * Conky/Diagnostics consumers depend on them); newer capability groups are
 * namespaced objects.
 */
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

  // Persistence — settings (scalar prefs) + session (window layout).
  settings: {
    get: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('settings:get'),
    set: (partial: Record<string, unknown>): Promise<boolean> =>
      ipcRenderer.invoke('settings:set', partial),
  },
  session: {
    load: (): Promise<unknown> => ipcRenderer.invoke('session:load'),
    save: (state: unknown): Promise<boolean> => ipcRenderer.invoke('session:save', state),
  },

  // Read-only sandboxed filesystem (File Explorer, terminal ls/cat).
  fs: {
    list: (rel: string): Promise<unknown> => ipcRenderer.invoke('fs:list', rel),
    read: (rel: string): Promise<unknown> => ipcRenderer.invoke('fs:read', rel),
  },
  // Consent-gated open/save through native dialogs (Notepad).
  dialog: {
    openFile: (): Promise<unknown> => ipcRenderer.invoke('dialog:open-file'),
    saveFile: (req: { path?: string; content: string }): Promise<unknown> =>
      ipcRenderer.invoke('dialog:save-file', req),
  },

  // Live market data (hardcoded-host fetch in main; deterministic fallback).
  market: {
    candles: (req: { symbol: string; interval?: string }): Promise<unknown> =>
      ipcRenderer.invoke('market:candles', req),
    ticker: (symbols: string[]): Promise<unknown> => ipcRenderer.invoke('market:ticker', symbols),
  },

  // Bliss AI — the Claude assistant. Key custody + network live in main;
  // ai:chunk is the project's one main→renderer push channel.
  ai: {
    setKey: (key: string): Promise<boolean> => ipcRenderer.invoke('ai:set-key', key),
    hasKey: (): Promise<boolean> => ipcRenderer.invoke('ai:has-key'),
    chat: (req: {
      messages: Array<{ role: string; content: string }>;
      model?: string;
    }): Promise<unknown> => ipcRenderer.invoke('ai:chat', req),
    cancel: (streamId: string): Promise<void> => ipcRenderer.invoke('ai:cancel', streamId),
    onChunk: (
      cb: (msg: { streamId: string; type: 'delta' | 'done' | 'error'; text?: string }) => void,
    ): (() => void) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        msg: { streamId: string; type: 'delta' | 'done' | 'error'; text?: string },
      ) => cb(msg);
      ipcRenderer.on('ai:chunk', handler);
      return () => ipcRenderer.removeListener('ai:chunk', handler);
    },
  },
});
