import { useWindowStore } from './windowStore';

/** App ids currently considered "running" (visible window or closed-but-alive). */
export function useRunningAppIds(): string[] {
  return useWindowStore((s) => Object.keys(s.running));
}

export function useIsRunning(appId: string): boolean {
  return useWindowStore((s) => !!s.running[appId]);
}

/** Convenience action: launch an app, or focus it if already open. */
export function useOpenOrFocus(): (appId: string) => void {
  return useWindowStore((s) => s.openOrFocus);
}
