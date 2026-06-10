export interface SystemStats {
  cores: number[];
  cpu: number;
  ramUsed: number;
  ramTotal: number;
}

export interface ElectronAPI {
  platform: string;
  versions: { electron: string; chrome: string; node: string };
  getSystemStats: () => Promise<SystemStats>;
  toggleFullscreen: () => Promise<boolean>;
  setFullscreen: (value: boolean) => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
