import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ControlSide = 'left' | 'right';
export type AnimationSpeed = 'slow' | 'normal' | 'fast';
export type ParticleDensity = 'low' | 'medium' | 'high';
export type ParticleSpeed = 'slow' | 'normal' | 'fast';

export interface Preferences {
  // Animation presets
  minimizePreset: string;
  restorePreset: string;
  animationSpeed: AnimationSpeed;
  dramaticMode: boolean;
  // Window behavior
  wobbleStrength: number; // 0–100 (60 = baseline feel)
  wobbleSpeed: number; // 0–100 (50 = baseline)
  snapStrength: number; // 0–100 (50 = baseline 18px)
  // Desktop feel
  defaultOpacity: number; // 0.4–1
  glassMode: boolean;
  // Controls
  controlSide: ControlSide;
  // Close/quit
  fireEffects: boolean; // burn animation on close/quit
  // Living Parallax Desktop
  parallaxEnabled: boolean;
  parallaxStrength: number; // 0–100
  particleDensity: ParticleDensity;
  particleSpeed: ParticleSpeed;
  hackerMode: boolean;
  // Demo tools
  showDesktopIcons: boolean;
  showTaskbarDots: boolean;
  showAnimationDebug: boolean;
}

const DEFAULTS: Preferences = {
  minimizePreset: 'genie',
  restorePreset: 'genie',
  animationSpeed: 'normal',
  dramaticMode: false,
  wobbleStrength: 60,
  wobbleSpeed: 50,
  snapStrength: 50,
  defaultOpacity: 1,
  glassMode: false,
  controlSide: 'right',
  fireEffects: true,
  parallaxEnabled: true,
  parallaxStrength: 50,
  particleDensity: 'medium',
  particleSpeed: 'normal',
  hackerMode: false,
  showDesktopIcons: true,
  showTaskbarDots: true,
  showAnimationDebug: false,
};

interface PreferencesState extends Preferences {
  update: (patch: Partial<Preferences>) => void;
  reset: () => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      update: (patch) => set(patch),
      reset: () => set(DEFAULTS),
    }),
    { name: 'bliss-os-preferences' },
  ),
);

/** Multiplier applied to spring tension for the global animation speed. */
export function animSpeedFactor(speed: AnimationSpeed): number {
  return speed === 'slow' ? 0.6 : speed === 'fast' ? 1.7 : 1;
}
