import { effect, Injectable, signal } from '@angular/core';

export const THEME_IDS = ['bliss', 'cyber', 'synthwave', 'hologram', 'matrix'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_LABELS: Record<ThemeId, string> = {
  bliss: 'Bliss Classic',
  cyber: 'Cyber Night',
  synthwave: 'Synthwave Sunset',
  hologram: 'Hologram White',
  matrix: 'Matrix',
};

/** The WebGL side of a theme — parsed from the CSS --scene-* tokens so the
 *  stylesheet stays the single source of truth for every theme's palette. */
export interface ScenePalette {
  skyTop: string;
  skyBot: string;
  grid: string;
  gridDim: string;
  building: string;
  star: string;
  nebulaA: string;
  nebulaB: string;
  nebulaC: string;
  /** Feature flags: aurora | sun | shootingstars | digitalrain | scanlines | soft */
  flags: Set<string>;
}

const STORAGE_KEY = 'bliss.theme';

/**
 * Theme switching = one attribute write. All shell chrome re-colors instantly
 * through the CSS custom properties in src/styles/tokens.css; the WebGL world
 * follows by lerping its uniforms toward `scenePalette` (the desktop component
 * bridges this signal to DesktopScene.setPalette).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<ThemeId>(this.load());
  readonly scenePalette = signal<ScenePalette>(this.parseScene());

  constructor() {
    effect(() => {
      const t = this.theme();
      document.documentElement.dataset['theme'] = t;
      try {
        localStorage.setItem(STORAGE_KEY, t);
      } catch {
        /* storage unavailable (headless) — theme still applies */
      }
      // getComputedStyle isn't reactive; re-parse after the attribute lands.
      this.scenePalette.set(this.parseScene());
    });
  }

  setTheme(t: ThemeId): void {
    if (THEME_IDS.includes(t)) this.theme.set(t);
  }

  private load(): ThemeId {
    try {
      const t = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
      return t && THEME_IDS.includes(t) ? t : 'bliss';
    } catch {
      return 'bliss';
    }
  }

  private parseScene(): ScenePalette {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => (cs.getPropertyValue(name).trim() || fallback);
    const flags = v('--scene-flags', '')
      .replace(/['"]/g, '')
      .split(/\s+/)
      .filter(Boolean);
    return {
      skyTop: v('--scene-sky-top', '#0a1a4d'),
      skyBot: v('--scene-sky-bot', '#03081f'),
      grid: v('--scene-grid', '#2ad0ff'),
      gridDim: v('--scene-grid-dim', '#10416e'),
      building: v('--scene-building', '#2ad0ff'),
      star: v('--scene-star', '#9ec3ff'),
      nebulaA: v('--scene-nebula-a', '#3a1d6e'),
      nebulaB: v('--scene-nebula-b', '#1d3a6e'),
      nebulaC: v('--scene-nebula-c', '#6e1d52'),
      flags: new Set(flags),
    };
  }
}
