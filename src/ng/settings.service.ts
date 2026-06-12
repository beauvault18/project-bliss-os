import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { ThemeService, THEME_IDS, type ThemeId } from './theme.service';
import { setMotionScale } from './motion';

export type QualityTier = 'low' | 'med' | 'high' | 'ultra';
export type QualitySetting = 'auto' | QualityTier;
export type AiModel = 'claude-fable-5' | 'claude-sonnet-4-6';

/** Motion scale steps: 0 = reduced motion (instant one-shots). */
export const MOTION_SCALES = [0, 0.5, 1, 1.5] as const;

/**
 * User preferences as signals, persisted through the settings IPC channel
 * (settings.json in userData) with a localStorage-free design: outside
 * Electron the defaults simply apply per session. Hydration is async; writes
 * are suppressed until the stored values have been applied so boot can never
 * clobber the file with defaults.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private themes = inject(ThemeService);

  readonly quality = signal<QualitySetting>('auto');
  readonly motionScale = signal<number>(
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : 1,
  );
  readonly volume = signal(0.5);
  readonly muted = signal(false);
  readonly soundEnabled = signal(true);
  readonly aiModel = signal<AiModel>('claude-fable-5');
  readonly bootAnimation = signal(true);
  /** Head-coupled parallax from the webcam — on by user request; the analysis
   *  is entirely on-device (see HeadTrackingService). */
  readonly headTracking = signal(true);

  private hydrated = false;

  constructor() {
    // Live-track the OS-level reduced-motion preference (until the user has
    // explicitly chosen a scale, which the persisted value represents).
    try {
      matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
        if (!this.hydrated) this.motionScale.set(e.matches ? 0 : 1);
      });
    } catch {
      /* matchMedia unavailable */
    }

    void this.hydrate();

    // The single writer for the global motion scale.
    effect(() => setMotionScale(this.motionScale()));

    // Persist on any change (after hydration).
    effect(() => {
      const snapshot = {
        theme: this.themes.theme(),
        quality: this.quality(),
        motionScale: this.motionScale(),
        volume: this.volume(),
        muted: this.muted(),
        soundEnabled: this.soundEnabled(),
        aiModel: this.aiModel(),
        bootAnimation: this.bootAnimation(),
        headTracking: this.headTracking(),
      };
      if (!untracked(() => this.hydrated)) return;
      void window.electronAPI?.settings?.set(snapshot).catch(() => {});
    });
  }

  private async hydrate(): Promise<void> {
    try {
      const s = await window.electronAPI?.settings?.get();
      if (s) {
        if (typeof s['theme'] === 'string' && THEME_IDS.includes(s['theme'] as ThemeId)) {
          this.themes.setTheme(s['theme'] as ThemeId);
        }
        if (
          typeof s['quality'] === 'string' &&
          ['auto', 'low', 'med', 'high', 'ultra'].includes(s['quality'])
        ) {
          this.quality.set(s['quality'] as QualitySetting);
        }
        if (typeof s['motionScale'] === 'number' && MOTION_SCALES.includes(s['motionScale'] as 0)) {
          this.motionScale.set(s['motionScale']);
        }
        if (typeof s['volume'] === 'number') this.volume.set(Math.max(0, Math.min(1, s['volume'])));
        if (typeof s['muted'] === 'boolean') this.muted.set(s['muted']);
        if (typeof s['soundEnabled'] === 'boolean') this.soundEnabled.set(s['soundEnabled']);
        if (s['aiModel'] === 'claude-fable-5' || s['aiModel'] === 'claude-sonnet-4-6') {
          this.aiModel.set(s['aiModel']);
        }
        if (typeof s['bootAnimation'] === 'boolean') this.bootAnimation.set(s['bootAnimation']);
        if (typeof s['headTracking'] === 'boolean') this.headTracking.set(s['headTracking']);
      }
    } catch {
      /* bridge absent (plain browser) — session-local defaults apply */
    }
    this.hydrated = true;
  }
}
