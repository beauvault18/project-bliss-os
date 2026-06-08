import type { CSSProperties } from 'react';
import { genieStyle } from '../effects/minimizeEffects';
import { somersaultTokenStyle } from '../effects/somersaultEffects';
import { emberCloseStyle, fireQuitStyle } from '../effects/closeEffects';

/** Geometry handed to a minimize style: where/how far to collapse. */
export interface MinimizeGeometry {
  dx: number; // center-to-center delta x (px) toward the target
  dy: number; // center-to-center delta y (px)
  targetScale: number; // final scale at full collapse
  pointDown: boolean; // target is below the window (genie neck points down)
}

/** progress 1 = fully shown (normal), 0 = fully collapsed at the target. */
export type MinimizeStyle = (
  progress: number,
  geo: MinimizeGeometry,
) => CSSProperties;

export interface AnimConfig {
  tension?: number;
  friction?: number;
  mass?: number;
  clamp?: boolean;
}

export interface MinimizePreset {
  id: string;
  label: string;
  style: MinimizeStyle;
  /** Spring config for collapsing. */
  config: AnimConfig;
  /** Spring config for restoring (defaults to a springier overshoot). */
  restoreConfig?: AnimConfig;
  /** Land as a desktop process token instead of collapsing into the taskbar. */
  landsOnDesktop?: boolean;
}

/**
 * Registry of minimize/restore animations. Phase E adds more presets here and
 * Bliss Lab (Phase D) lets the user switch between them live.
 */
export const MINIMIZE_PRESETS: Record<string, MinimizePreset> = {
  genie: {
    id: 'genie',
    label: 'Genie',
    style: genieStyle,
    config: { tension: 230, friction: 26 },
    restoreConfig: { tension: 260, friction: 18 },
  },
  'somersault-token': {
    id: 'somersault-token',
    label: 'Somersault Token',
    style: somersaultTokenStyle,
    config: { tension: 170, friction: 20 },
    restoreConfig: { tension: 200, friction: 16 },
    landsOnDesktop: true,
  },
  // Phase E stubs — register a `style` + `config` and they light up automatically:
  // gravity:    { id: 'gravity',    label: 'Gravity Drop',style: gravityStyle,    config: {...} },
  // cube:       { id: 'cube',       label: 'Cube Flip',   style: cubeStyle,       config: {...} },
};

export const DEFAULT_MINIMIZE_PRESET = 'genie';

export function getMinimizePreset(id: string): MinimizePreset {
  return MINIMIZE_PRESETS[id] ?? MINIMIZE_PRESETS[DEFAULT_MINIMIZE_PRESET];
}

// --- Close / Quit animation presets (Phase E1) ---------------------------

export interface ClosePalette {
  glow: string; // burn line / leading edge
  ember: string; // falling sparks
}

export interface ClosePreset {
  id: string;
  label: string;
  /** Wrapper style; progress 1 = intact, 0 = fully burned away. */
  style: (progress: number, dramatic: boolean) => CSSProperties;
  /** Burn duration in ms (deterministic so the close always finalizes). */
  durationMs: number;
  /** What to do when the burn finishes. */
  finalize: 'close' | 'quit';
  palette: ClosePalette;
  baseEmbers: number;
}

export const CLOSE_PRESETS: Record<string, ClosePreset> = {
  'ember-close': {
    id: 'ember-close',
    label: 'Ember Close',
    style: emberCloseStyle,
    durationMs: 850,
    finalize: 'close',
    palette: { glow: '#8fd0ff', ember: '#ffb45a' },
    baseEmbers: 8,
  },
  'fire-quit': {
    id: 'fire-quit',
    label: 'Fire Quit',
    style: fireQuitStyle,
    durationMs: 1150,
    finalize: 'quit',
    palette: { glow: '#ffd24a', ember: '#ff5a1a' },
    baseEmbers: 16,
  },
};

export const CLOSE_PRESET = 'ember-close';
export const QUIT_PRESET = 'fire-quit';

export function getClosePreset(id: string): ClosePreset {
  return CLOSE_PRESETS[id] ?? CLOSE_PRESETS[CLOSE_PRESET];
}
