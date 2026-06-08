import { useMemo } from 'react';
import { useWindowStore } from './windowStore';

/** App ids currently considered "running" (visible window or closed-but-alive). */
export function useRunningAppIds(): string[] {
  // Select the stable `running` object (not a fresh array) to avoid an
  // infinite re-render loop under zustand v5's Object.is snapshot check.
  const running = useWindowStore((s) => s.running);
  return useMemo(() => Object.keys(running), [running]);
}

export function useIsRunning(appId: string): boolean {
  return useWindowStore((s) => !!s.running[appId]);
}

/** Convenience action: launch an app, or focus it if already open. */
export function useOpenOrFocus(): (appId: string) => void {
  return useWindowStore((s) => s.openOrFocus);
}
