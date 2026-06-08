import type { CSSProperties } from 'react';
import { genieStyle } from '../effects/minimizeEffects';
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
  // Phase E stubs — register a `style` + `config` and they light up automatically:
  // somersault: { id: 'somersault', label: 'Somersault', style: somersaultStyle, config: {...} },
  // fire:       { id: 'fire',       label: 'Fire Shrink', style: fireStyle,       config: {...} },
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
  config: AnimConfig;
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
    config: { tension: 95, friction: 21 },
    finalize: 'close',
    palette: { glow: '#8fd0ff', ember: '#ffb45a' },
    baseEmbers: 8,
  },
  'fire-quit': {
    id: 'fire-quit',
    label: 'Fire Quit',
    style: fireQuitStyle,
    config: { tension: 70, friction: 19 },
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
