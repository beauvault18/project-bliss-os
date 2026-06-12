import { Component, inject, signal } from '@angular/core';
import { ThemeService, THEME_IDS, THEME_LABELS, type ThemeId } from '../../ng/theme.service';
import { SettingsService, type QualitySetting } from '../../ng/settings.service';
import { WindowStore } from '../../ng/window-store';
import { WorkspaceStore } from '../../ng/workspace-store';
import { seedDemoLayout } from '../../ng/demo-layout';

/** Per-theme swatch gradients for the picker cards (accent → sky). */
const SWATCHES: Record<ThemeId, string> = {
  bliss: 'linear-gradient(135deg, #00c8ff 0%, #0a1a4d 60%, #03081f 100%)',
  cyber: 'linear-gradient(135deg, #00f0ff 0%, #ff2bd6 45%, #000508 100%)',
  synthwave: 'linear-gradient(135deg, #ffb347 0%, #ff6ec7 45%, #12041c 100%)',
  hologram: 'linear-gradient(135deg, #ffffff 0%, #7aa8ff 50%, #aac4f5 100%)',
  matrix: 'linear-gradient(135deg, #00ff66 0%, #053818 55%, #000803 100%)',
};

/**
 * Control Center — the OS settings surface. Everything here writes signals on
 * ThemeService/SettingsService, which persist through the settings IPC and
 * fan out live: theme cards morph the whole shell + galaxy on click, motion
 * scale retimes every animation system, quality re-tiers the WebGL scene.
 */
@Component({
  selector: 'bliss-settings',
  standalone: true,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        background: rgba(8, 12, 22, 0.55);
        backdrop-filter: blur(10px);
      }
      .cc {
        box-sizing: border-box;
        height: 100%;
        overflow-y: auto;
        padding: 14px 16px;
        color: var(--text-1);
        font-family: var(--font-ui);
      }
      h3 {
        margin: 14px 0 8px;
        font-size: 0.7rem;
        font-family: var(--font-display);
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: var(--accent);
        text-shadow: 0 0 8px rgba(var(--accent-rgb), 0.4);
      }
      h3:first-child {
        margin-top: 0;
      }
      .themes {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
        gap: 8px;
      }
      .theme-card {
        position: relative;
        height: 64px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        cursor: pointer;
        overflow: hidden;
        padding: 0;
        transition: transform 0.12s ease, box-shadow 0.12s ease;
      }
      .theme-card:hover {
        transform: translateY(-2px);
      }
      .theme-card--on {
        border-color: var(--accent);
        box-shadow: 0 0 14px rgba(var(--accent-rgb), 0.55);
      }
      .theme-card__name {
        position: absolute;
        left: 8px;
        bottom: 6px;
        font-size: 0.72rem;
        font-weight: 600;
        color: #fff;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
      }
      .theme-card__check {
        position: absolute;
        top: 5px;
        right: 7px;
        font-size: 0.8rem;
        color: #fff;
        text-shadow: 0 0 6px rgba(0, 0, 0, 0.8);
      }
      .seg {
        display: inline-flex;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 7px;
        overflow: hidden;
      }
      .seg button {
        border: none;
        background: rgba(255, 255, 255, 0.06);
        color: var(--text-1);
        font: 600 0.78rem var(--font-ui);
        padding: 6px 12px;
        cursor: pointer;
      }
      .seg button:hover {
        background: rgba(255, 255, 255, 0.14);
      }
      .seg button.on {
        background: rgba(var(--accent-rgb), 0.35);
        color: #fff;
        text-shadow: 0 0 6px rgba(var(--accent-rgb), 0.8);
      }
      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 0;
        font-size: 0.84rem;
      }
      .row .grow {
        flex: 1;
      }
      input[type='range'] {
        flex: 1;
        accent-color: var(--accent);
      }
      .toggle {
        width: 42px;
        height: 22px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.25);
        background: rgba(255, 255, 255, 0.12);
        position: relative;
        cursor: pointer;
        transition: background 0.15s;
        flex: none;
      }
      .toggle--on {
        background: rgba(var(--accent-rgb), 0.55);
        box-shadow: 0 0 8px rgba(var(--accent-rgb), 0.5);
      }
      .knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
        transition: transform 0.15s;
      }
      .toggle--on .knob {
        transform: translateX(20px);
      }
      .hint {
        font-size: 0.72rem;
        opacity: 0.6;
        margin: 4px 0 0;
      }
      .btn {
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.08);
        color: var(--text-1);
        font: 600 0.8rem var(--font-ui);
        padding: 7px 14px;
        cursor: pointer;
      }
      .btn:hover {
        background: rgba(var(--accent-rgb), 0.25);
      }
      .pct {
        width: 40px;
        text-align: right;
        font-variant-numeric: tabular-nums;
        opacity: 0.8;
        font-size: 0.78rem;
      }
      .key-input {
        flex: 1;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 7px;
        outline: none;
        color: var(--text-1);
        font: 500 0.8rem var(--font-mono);
        padding: 7px 10px;
        caret-color: var(--accent);
      }
      .key-input:focus {
        border-color: rgba(var(--accent-rgb), 0.6);
      }
    `,
  ],
  template: `
    <div class="cc" data-testid="settings-app">
      <h3>Theme</h3>
      <div class="themes">
        @for (t of themeIds; track t) {
          <button
            class="theme-card"
            [class.theme-card--on]="themes.theme() === t"
            [style.background]="swatch(t)"
            [attr.data-theme-card]="t"
            (click)="themes.setTheme(t)"
          >
            @if (themes.theme() === t) {
              <span class="theme-card__check">✓</span>
            }
            <span class="theme-card__name">{{ label(t) }}</span>
          </button>
        }
      </div>

      <h3>Graphics Quality</h3>
      <div class="seg">
        @for (q of qualities; track q) {
          <button [class.on]="settings.quality() === q" (click)="settings.quality.set(q)">
            {{ q.toUpperCase() }}
          </button>
        }
      </div>
      <p class="hint">AUTO measures your GPU and picks a tier; the scene re-tiers live.</p>

      <h3>Motion</h3>
      <div class="seg">
        <button [class.on]="settings.motionScale() === 0" (click)="settings.motionScale.set(0)">
          REDUCED
        </button>
        <button [class.on]="settings.motionScale() === 0.5" (click)="settings.motionScale.set(0.5)">
          CINEMATIC
        </button>
        <button [class.on]="settings.motionScale() === 1" (click)="settings.motionScale.set(1)">
          NORMAL
        </button>
        <button [class.on]="settings.motionScale() === 1.5" (click)="settings.motionScale.set(1.5)">
          SNAPPY
        </button>
      </div>
      <p class="hint">Retimes the cube spin, genie, fire and open animations. REDUCED makes them instant.</p>

      <h3>Head Tracking</h3>
      <div class="row">
        <span class="grow">Head-coupled parallax (camera)</span>
        <button
          class="toggle"
          data-testid="head-toggle"
          [class.toggle--on]="settings.headTracking()"
          (click)="settings.headTracking.set(!settings.headTracking())"
          aria-label="Toggle head tracking"
        >
          <span class="knob"></span>
        </button>
      </div>
      <p class="hint">
        Move your head and the galaxy parallaxes like a window; lean in to zoom. The webcam
        feed is analyzed entirely on this machine — nothing is recorded, stored, or sent.
      </p>

      <h3>Sound</h3>
      <div class="row">
        <span class="grow">UI sounds</span>
        <button
          class="toggle"
          [class.toggle--on]="settings.soundEnabled()"
          (click)="settings.soundEnabled.set(!settings.soundEnabled())"
          aria-label="Toggle UI sounds"
        >
          <span class="knob"></span>
        </button>
      </div>
      <div class="row">
        <span>Volume</span>
        <input
          type="range"
          min="0"
          max="100"
          [value]="settings.volume() * 100"
          (input)="onVolume($event)"
        />
        <span class="pct">{{ (settings.volume() * 100).toFixed(0) }}%</span>
      </div>

      <h3>Bliss AI</h3>
      <div class="seg">
        <button
          [class.on]="settings.aiModel() === 'claude-fable-5'"
          (click)="settings.aiModel.set('claude-fable-5')"
        >
          FABLE 5
        </button>
        <button
          [class.on]="settings.aiModel() === 'claude-sonnet-4-6'"
          (click)="settings.aiModel.set('claude-sonnet-4-6')"
        >
          SONNET 4.6
        </button>
      </div>
      <div class="row">
        <input
          class="key-input"
          type="password"
          placeholder="Anthropic API key (sk-ant-…)"
          [value]="keyDraft()"
          (input)="keyDraft.set($any($event.target).value)"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="btn" (click)="saveKey()">{{ keyStatus() === 'set' ? 'Replace' : 'Save' }}</button>
        @if (keyStatus() === 'set') {
          <button class="btn" (click)="clearKey()">Clear</button>
        }
      </div>
      <p class="hint">
        @if (keyStatus() === 'set') {
          ✓ Key stored encrypted (safeStorage) in the main process — it never reaches this window again.
        } @else if (keyStatus() === 'saved') {
          ✓ Saved. The key is encrypted at rest and only the main process can read it.
        } @else {
          The key is sent once to the main process, encrypted with the OS keystore, and never exposed to apps.
        }
      </p>

      <h3>Session</h3>
      <div class="row">
        <button class="btn" data-testid="reset-layout" (click)="resetLayout()">
          Reset to demo layout
        </button>
      </div>
    </div>
  `,
})
export class SettingsApp {
  readonly themes = inject(ThemeService);
  readonly settings = inject(SettingsService);
  private store = inject(WindowStore);
  private ws = inject(WorkspaceStore);

  readonly themeIds = THEME_IDS;
  readonly qualities: QualitySetting[] = ['auto', 'low', 'med', 'high', 'ultra'];
  readonly keyDraft = signal('');
  readonly keyStatus = signal<'none' | 'set' | 'saved'>('none');

  constructor() {
    void window.electronAPI?.ai
      ?.hasKey()
      .then((v) => this.keyStatus.set(v ? 'set' : 'none'))
      .catch(() => {});
  }

  /** Hand the key to the main process (safeStorage) and clear the field —
   *  after this moment the renderer never sees it again. */
  async saveKey(): Promise<void> {
    const key = this.keyDraft().trim();
    if (!key) return;
    const ok = await window.electronAPI?.ai?.setKey(key).catch(() => false);
    if (ok) {
      this.keyDraft.set('');
      this.keyStatus.set('saved');
    }
  }

  async clearKey(): Promise<void> {
    await window.electronAPI?.ai?.setKey('').catch(() => {});
    this.keyStatus.set('none');
  }

  swatch(t: ThemeId): string {
    return SWATCHES[t];
  }

  label(t: ThemeId): string {
    return THEME_LABELS[t];
  }

  onVolume(e: Event): void {
    this.settings.volume.set(Number((e.target as HTMLInputElement).value) / 100);
  }

  /** Close everything (including this window) and re-seed the demo layout. */
  resetLayout(): void {
    for (const w of this.store.windows()) this.store.close(w.id);
    seedDemoLayout(this.store);
    this.ws.active.set(0);
  }
}
