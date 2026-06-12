/**
 * The single source of truth for every IPC channel name. Imported by the main
 * process (handler registration), the preload bridge (invoke wrappers), and
 * mirrored by `src/electron-api.d.ts` (the renderer-side type contract).
 *
 * POLICY (see docs/ipc-contract.md): channels are purpose-specific and
 * whitelisted. There is NO generic exec channel, NO generic fetch proxy, and
 * NO fs write outside dialog-consented paths. Any network egress happens in
 * the main process against a hardcoded host allowlist.
 */
export const CH = {
  // System telemetry + window state (v1 channels — shapes are additive-only).
  systemStats: 'get-system-stats',
  toggleFullscreen: 'window:toggle-fullscreen',
  setFullscreen: 'window:set-fullscreen',
  isFullscreen: 'window:is-fullscreen',
} as const;

export type ChannelName = (typeof CH)[keyof typeof CH];

/** Shape returned by `get-system-stats`. Extend additively only — the smoke
 *  harness and the Conky/Diagnostics consumers rely on the v1 fields. */
export interface SystemStats {
  cores: number[];
  cpu: number;
  ramUsed: number;
  ramTotal: number;
}
