import { effect, inject, Injectable } from '@angular/core';
import { SettingsService } from './settings.service';
import { WindowStore } from './window-store';
import { WorkspaceStore } from './workspace-store';

/**
 * The OS sound designer — every UI sound is SYNTHESIZED with WebAudio (zero
 * assets, zero CSP impact). One lazy AudioContext is created on the first
 * user gesture (headless smoke dispatches synthetic events that never unlock
 * audio — every call is try/caught so that can't error). A master gain node
 * tracks the volume/mute/enabled settings.
 *
 * Two wiring styles, matching the app's reactive grammar:
 *   - Reactive moments (cube spin, expo, window count changes) are watched by
 *     constructor effect()s — the SoundDirector half.
 *   - Gesture-coupled moments (genie, fire, snap, edge-flip) are direct calls
 *     from the handlers that own them.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  private settings = inject(SettingsService);
  private store = inject(WindowStore);
  private ws = inject(WorkspaceStore);

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private unlocked = false;

  constructor() {
    // Lazy unlock on the first real user gesture.
    const unlock = () => {
      this.unlocked = true;
      this.ensure();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    // Master volume follows settings live.
    effect(() => {
      const vol = this.settings.muted() || !this.settings.soundEnabled() ? 0 : this.settings.volume();
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(vol * 0.5, this.ctx.currentTime, 0.05);
      }
    });

    // --- SoundDirector: reactive moments ---
    let lastSpin: unknown = null;
    effect(() => {
      const spin = this.ws.spin();
      if (spin && !lastSpin) this.cubeSpin((spin as { to: number; from: number }).to - (spin as { from: number }).from);
      lastSpin = spin;
    });
    let lastMode = this.ws.mode();
    effect(() => {
      const mode = this.ws.mode();
      if (mode !== lastMode) this.expo(mode === 'EXPO');
      lastMode = mode;
    });
    let lastCount = -1;
    effect(() => {
      const count = this.store.windows().length;
      if (lastCount >= 0 && count > lastCount) this.open();
      lastCount = count;
    });
  }

  private ensure(): AudioContext | null {
    if (!this.unlocked) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        const vol = this.settings.muted() || !this.settings.soundEnabled() ? 0 : this.settings.volume();
        this.master.gain.value = vol * 0.5;
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  private env(gain: GainNode, t0: number, peak: number, attack: number, decay: number): void {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  /** Two-sine "materialize" chime — window open. */
  open(): void {
    try {
      const ctx = this.ensure();
      if (!ctx || !this.master) return;
      const t0 = ctx.currentTime;
      for (const [f1, f2, det] of [
        [520, 780, 0],
        [655, 985, 6],
      ] as const) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.detune.value = det;
        osc.frequency.setValueAtTime(f1, t0);
        osc.frequency.exponentialRampToValueAtTime(f2, t0 + 0.16);
        this.env(g, t0, 0.18, 0.012, 0.17);
        osc.connect(g).connect(this.master);
        osc.start(t0);
        osc.stop(t0 + 0.22);
      }
    } catch {
      /* audio unavailable */
    }
  }

  /** Noise → falling lowpass sweep + a sub-thump — fire close. */
  fireClose(): void {
    try {
      const ctx = this.ensure();
      if (!ctx || !this.master) return;
      const t0 = ctx.currentTime;
      const noise = this.noiseSource(ctx, 0.5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2400, t0);
      lp.frequency.exponentialRampToValueAtTime(300, t0 + 0.45);
      const g = ctx.createGain();
      this.env(g, t0, 0.22, 0.02, 0.46);
      noise.connect(lp).connect(g).connect(this.master);
      noise.start(t0);
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = 70;
      const sg = ctx.createGain();
      this.env(sg, t0, 0.25, 0.005, 0.08);
      sub.connect(sg).connect(this.master);
      sub.start(t0);
      sub.stop(t0 + 0.1);
    } catch {
      /* audio unavailable */
    }
  }

  /** Triangle portamento "schloop" — genie minimize (reverse on restore). */
  genie(restore = false): void {
    try {
      const ctx = this.ensure();
      if (!ctx || !this.master) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const [fa, fb] = restore ? [180, 600] : [600, 180];
      osc.frequency.setValueAtTime(fa, t0);
      osc.frequency.exponentialRampToValueAtTime(fb, t0 + 0.32);
      const g = ctx.createGain();
      this.env(g, t0, 0.16, 0.015, 0.33);
      osc.connect(g).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.38);
    } catch {
      /* audio unavailable */
    }
  }

  /** Bandpassed noise whoosh, panned with the direction — cube spin. */
  cubeSpin(dir: number): void {
    try {
      const ctx = this.ensure();
      if (!ctx || !this.master) return;
      const t0 = ctx.currentTime;
      const noise = this.noiseSource(ctx, 1.0);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(200, t0);
      bp.frequency.exponentialRampToValueAtTime(80, t0 + 0.45);
      bp.frequency.exponentialRampToValueAtTime(200, t0 + 0.92);
      const pan = ctx.createStereoPanner();
      pan.pan.setValueAtTime(dir > 0 ? -0.7 : 0.7, t0);
      pan.pan.linearRampToValueAtTime(dir > 0 ? 0.7 : -0.7, t0 + 0.9);
      const g = ctx.createGain();
      this.env(g, t0, 0.13, 0.08, 0.85);
      noise.connect(bp).connect(pan).connect(g).connect(this.master);
      noise.start(t0);
    } catch {
      /* audio unavailable */
    }
  }

  /** Short zap — edge-flip trigger (the spin whoosh follows via the effect). */
  edgeFlip(): void {
    try {
      const ctx = this.ensure();
      if (!ctx || !this.master) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 1200;
      const g = ctx.createGain();
      this.env(g, t0, 0.07, 0.004, 0.028);
      osc.connect(g).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.04);
    } catch {
      /* audio unavailable */
    }
  }

  /** Filtered low thunk — magnetic snap commit. */
  snap(): void {
    try {
      const ctx = this.ensure();
      if (!ctx || !this.master) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, t0);
      osc.frequency.exponentialRampToValueAtTime(85, t0 + 0.07);
      const g = ctx.createGain();
      this.env(g, t0, 0.3, 0.006, 0.08);
      osc.connect(g).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.1);
    } catch {
      /* audio unavailable */
    }
  }

  /** Airy sine-stack chord, up on enter / down on exit — Expo. */
  private expo(entering: boolean): void {
    try {
      const ctx = this.ensure();
      if (!ctx || !this.master) return;
      const t0 = ctx.currentTime;
      const freqs = entering ? [392, 494, 587] : [587, 494, 392];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        const g = ctx.createGain();
        this.env(g, t0 + i * 0.07, 0.08, 0.03, 0.32);
        osc.connect(g).connect(this.master!);
        osc.start(t0 + i * 0.07);
        osc.stop(t0 + i * 0.07 + 0.4);
      });
    } catch {
      /* audio unavailable */
    }
  }

  /** Notification ping. */
  notify(): void {
    try {
      const ctx = this.ensure();
      if (!ctx || !this.master) return;
      const t0 = ctx.currentTime;
      for (const [f, dt] of [
        [880, 0],
        [1318, 0.09],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        const g = ctx.createGain();
        this.env(g, t0 + dt, 0.12, 0.008, 0.18);
        osc.connect(g).connect(this.master);
        osc.start(t0 + dt);
        osc.stop(t0 + dt + 0.22);
      }
    } catch {
      /* audio unavailable */
    }
  }

  private noiseSource(ctx: AudioContext, seconds: number): AudioBufferSourceNode {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    let s = 0x12345678; // deterministic noise (no Math.random)
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      ch[i] = (s / 0x7fffffff) * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }
}
