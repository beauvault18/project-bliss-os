import type { WindowStore, Win, OpenOpts } from '../../ng/window-store';
import type { WorkspaceStore } from '../../ng/workspace-store';
import type { PageVisibilityService } from '../../ng/window-visibility';
import type { ThemeService, ThemeId } from '../../ng/theme.service';

export interface BlissApiDeps {
  store: WindowStore;
  ws: WorkspaceStore;
  pv: PageVisibilityService;
  themes: ThemeService;
  minimize: (w: Win) => void;
  toggleMaximize: (w: Win) => void;
  fireClose: (w: Win) => void;
  genieSize: () => number;
  /** One switcher step + commit (the smoke harness's alt-tab probe). */
  altTab: () => void;
  notify: (glyph: string, title: string, body?: string) => void;
  /** Free-Look (the held floating cube): toggle + deterministic steering. */
  freeLook: () => void;
  freeRotate: (deg: number) => void;
  /** Inject a head pose into the parallax pipeline (camera-free test seam). */
  setHead: (x: number, y: number, depth: number) => void;
  /** Live tracking diagnostics (camera state, detector mode, hit counts). */
  headState: () => unknown;
}

/**
 * Installs the `window.__bliss` scripting/automation surface — the imperative
 * test API that the headless smoke harness (scripts/smoke.cjs) drives. Keys
 * are ADDITIVE-ONLY: the harness asserts against this exact contract.
 */
export function installBlissApi(deps: BlissApiDeps): void {
  const { store, ws, pv } = deps;
  const find = (id: string) => store.windows().find((x) => x.id === id);
  (window as unknown as { __bliss: unknown }).__bliss = {
    open: (id: string, opts?: OpenOpts) => store.open(id, opts),
    openOrFocus: (id: string) => store.openOrFocus(id),
    close: (id: string) => store.close(id),
    focus: (id: string) => store.focus(id),
    windows: () => store.windows(),
    workspace: () => ws.active(),
    switchWorkspace: (i: number) => ws.switchTo(i),
    moveToWorkspace: (id: string, w: number) => store.moveToWorkspace(id, w),
    spinning: () => !!ws.spin(),
    minimize: (id: string) => {
      const win = find(id);
      if (win) deps.minimize(win);
    },
    restore: (id: string) => store.requestRestore(id),
    resize: (id: string, w: number, h: number) => store.resize(id, w, h),
    toggleMaximize: (id: string) => {
      const win = find(id);
      if (win) deps.toggleMaximize(win);
    },
    fireClose: (id: string) => {
      const win = find(id);
      if (win) deps.fireClose(win);
    },
    setHidden: (hidden: boolean) => pv.hidden.set(hidden),
    toggleExpo: () => ws.toggleExpo(),
    mode: () => ws.mode(),
    setTheme: (t: string) => deps.themes.setTheme(t as ThemeId),
    theme: () => deps.themes.theme(),
    altTab: () => deps.altTab(),
    notify: (glyph: string, title: string, body?: string) => deps.notify(glyph, title, body),
    freeLook: () => deps.freeLook(),
    freeRotate: (deg: number) => deps.freeRotate(deg),
    setHead: (x: number, y: number, depth?: number) => deps.setHead(x, y, depth ?? 0),
    headState: () => deps.headState(),
    __genieSize: () => deps.genieSize(), // debug: held genie animations (leak check)
  };
}
