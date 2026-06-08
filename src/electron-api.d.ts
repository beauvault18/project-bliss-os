export interface ElectronAPI {
  platform: string;
  versions: { electron: string; chrome: string; node: string };
  toggleFullscreen: () => Promise<boolean>;
  setFullscreen: (value: boolean) => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
