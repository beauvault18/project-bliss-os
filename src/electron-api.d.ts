export interface SystemStats {
  cores: number[];
  cpu: number;
  ramUsed: number;
  ramTotal: number;
}

/** Serialized window layout — version-gated; unknown versions fall back to
 *  the seeded demo layout (persistence must never break boot). */
export interface SessionStateV1 {
  version: 1;
  active: number;
  windows: Array<{
    appId: string;
    title: string;
    x: number;
    y: number;
    w: number;
    h: number;
    workspace: number;
    minimized: boolean;
    maximized: boolean;
    prevGeom: { x: number; y: number; w: number; h: number } | null;
    pinned?: boolean;
  }>;
}

export interface FsEntry {
  name: string;
  kind: 'dir' | 'file';
  size: number;
  mtime: number;
}

export interface ElectronAPI {
  platform: string;
  versions: { electron: string; chrome: string; node: string };
  getSystemStats: () => Promise<SystemStats>;
  toggleFullscreen: () => Promise<boolean>;
  setFullscreen: (value: boolean) => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
  settings: {
    get: () => Promise<Record<string, unknown>>;
    set: (partial: Record<string, unknown>) => Promise<boolean>;
  };
  session: {
    load: () => Promise<SessionStateV1 | null>;
    save: (state: SessionStateV1) => Promise<boolean>;
  };
  fs: {
    list: (rel: string) => Promise<{ entries: FsEntry[]; truncated: boolean } | null>;
    read: (rel: string) => Promise<{ content: string } | { error: string }>;
  };
  dialog: {
    openFile: () => Promise<{ path: string; name: string; content: string } | null>;
    saveFile: (req: { path?: string; content: string }) => Promise<{ path: string; name: string } | null>;
  };
  market: {
    candles: (req: { symbol: string; interval?: string }) => Promise<
      | { source: 'live'; candles: Array<{ open: number; close: number; high: number; low: number }> }
      | { source: 'fallback' }
    >;
    ticker: (
      symbols: string[],
    ) => Promise<{ source: 'live'; prices: Record<string, number> } | { source: 'fallback' }>;
  };
  ai: {
    setKey: (key: string) => Promise<boolean>;
    hasKey: () => Promise<boolean>;
    chat: (req: {
      messages: Array<{ role: string; content: string }>;
      model?: string;
    }) => Promise<{ streamId: string } | { error: string }>;
    cancel: (streamId: string) => Promise<void>;
    onChunk: (
      cb: (msg: { streamId: string; type: 'delta' | 'done' | 'error'; text?: string }) => void,
    ) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
