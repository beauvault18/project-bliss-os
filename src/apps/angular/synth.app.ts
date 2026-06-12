import { Component, inject, OnDestroy, signal } from '@angular/core';
import { WINDOW_VISIBLE } from '../../ng/window-visibility';

/** Pentatonic rows (Hz) — everything you toggle sounds good together. */
const NOTES: Array<{ label: string; freq: number }> = [
  { label: 'C5', freq: 523.25 },
  { label: 'A4', freq: 440.0 },
  { label: 'G4', freq: 392.0 },
  { label: 'E4', freq: 329.63 },
  { label: 'D4', freq: 293.66 },
  { label: 'C4', freq: 261.63 },
  { label: 'A3', freq: 220.0 },
  { label: 'G3', freq: 196.0 },
];
const STEPS = 16;

/**
 * BlissWave — a 16-step WebAudio synth sequencer. Pure renderer, zero assets:
 * oscillators + a lowpass + delay feedback are built per-note. The transport
 * pauses with WINDOW_VISIBLE like every other app (the cube stays quiet when
 * the synth is off-face).
 */
@Component({
  selector: 'bliss-synth',
  standalone: true,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        background: rgba(8, 6, 18, 0.62);
        backdrop-filter: blur(10px);
      }
      .synth {
        box-sizing: border-box;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 10px 12px;
        color: var(--text-1);
        font-family: var(--font-ui);
      }
      .bar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding-bottom: 8px;
        flex: none;
      }
      .title {
        font: 600 0.72rem var(--font-display);
        letter-spacing: 0.16em;
        color: var(--accent);
        text-shadow: 0 0 8px rgba(var(--accent-rgb), 0.5);
      }
      .play {
        border: 1px solid rgba(var(--accent-rgb), 0.5);
        border-radius: 7px;
        background: rgba(var(--accent-rgb), 0.25);
        color: #fff;
        font: 600 0.78rem var(--font-ui);
        padding: 4px 14px;
        cursor: pointer;
      }
      .bar input[type='range'] {
        width: 90px;
        accent-color: var(--accent);
      }
      .bar .bpm {
        font: 500 0.72rem var(--font-mono);
        opacity: 0.8;
        width: 60px;
      }
      select {
        background: rgba(255, 255, 255, 0.08);
        color: var(--text-1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        font: 500 0.74rem var(--font-ui);
        padding: 3px 6px;
      }
      .grid {
        flex: 1;
        display: grid;
        grid-template-rows: repeat(${NOTES.length}, 1fr);
        gap: 3px;
        min-height: 0;
      }
      .row {
        display: grid;
        grid-template-columns: 34px repeat(${STEPS}, 1fr);
        gap: 3px;
        min-height: 0;
      }
      .note {
        display: flex;
        align-items: center;
        justify-content: center;
        font: 500 0.62rem var(--font-mono);
        opacity: 0.7;
      }
      .cell {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.045);
        cursor: pointer;
        padding: 0;
        min-height: 0;
      }
      .cell:nth-child(4n + 2) {
        border-left-color: rgba(255, 255, 255, 0.25);
      }
      .cell--on {
        background: rgba(var(--accent-rgb), 0.55);
        border-color: rgba(var(--accent-rgb), 0.8);
        box-shadow: 0 0 8px rgba(var(--accent-rgb), 0.45);
      }
      .cell--head {
        outline: 1px solid rgba(255, 255, 255, 0.55);
      }
    `,
  ],
  template: `
    <div class="synth" data-testid="synth-app">
      <div class="bar">
        <span class="title">BLISSWAVE</span>
        <button class="play" (click)="toggle()">{{ playing() ? '⏸ Stop' : '▶ Play' }}</button>
        <input type="range" min="70" max="180" [value]="bpm()" (input)="onBpm($event)" />
        <span class="bpm">{{ bpm() }} BPM</span>
        <select [value]="wave()" (change)="onWave($event)">
          <option value="sawtooth">saw</option>
          <option value="square">square</option>
          <option value="triangle">triangle</option>
          <option value="sine">sine</option>
        </select>
      </div>
      <div class="grid">
        @for (note of notes; track note.label; let r = $index) {
          <div class="row">
            <span class="note">{{ note.label }}</span>
            @for (s of stepIdx; track s) {
              <button
                class="cell"
                [class.cell--on]="pattern()[r][s]"
                [class.cell--head]="playing() && head() === s"
                (click)="toggleCell(r, s)"
                [attr.aria-label]="note.label + ' step ' + (s + 1)"
              ></button>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class SynthApp implements OnDestroy {
  readonly notes = NOTES;
  readonly stepIdx = Array.from({ length: STEPS }, (_, i) => i);
  readonly playing = signal(false);
  readonly head = signal(0);
  readonly bpm = signal(112);
  readonly wave = signal<OscillatorType>('sawtooth');
  /** A starter riff so pressing play immediately sounds like something. */
  readonly pattern = signal<boolean[][]>(
    NOTES.map((_, r) =>
      Array.from({ length: STEPS }, (_, s) => (s + r * 3) % 8 === 0 && r % 2 === 0),
    ),
  );

  private visible = inject(WINDOW_VISIBLE);
  private ctx?: AudioContext;
  private delay?: DelayNode;
  private master?: GainNode;
  private timer?: ReturnType<typeof setInterval>;

  toggle(): void {
    if (this.playing()) {
      this.playing.set(false);
      clearInterval(this.timer);
      return;
    }
    this.ensureAudio();
    this.playing.set(true);
    this.schedule();
  }

  private schedule(): void {
    clearInterval(this.timer);
    const stepMs = 60000 / this.bpm() / 4; // 16th notes
    this.timer = setInterval(() => {
      if (!this.visible() || !this.playing()) return;
      const s = (this.head() + 1) % STEPS;
      this.head.set(s);
      const pat = this.pattern();
      for (let r = 0; r < NOTES.length; r++) {
        if (pat[r][s]) this.pluck(NOTES[r].freq);
      }
    }, stepMs);
  }

  private ensureAudio(): void {
    if (this.ctx) {
      void this.ctx.resume().catch(() => {});
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      // A touch of feedback delay — instant synthwave space.
      this.delay = this.ctx.createDelay(1.0);
      this.delay.delayTime.value = 0.27;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.32;
      this.delay.connect(fb).connect(this.delay);
      this.master.connect(this.ctx.destination);
      this.delay.connect(this.master);
    } catch {
      this.ctx = undefined;
    }
  }

  private pluck(freq: number): void {
    if (!this.ctx || !this.master || !this.delay) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = this.wave();
    osc.frequency.value = freq;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t0);
    lp.frequency.exponentialRampToValueAtTime(500, t0 + 0.28);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
    osc.connect(lp).connect(g);
    g.connect(this.master);
    g.connect(this.delay);
    osc.start(t0);
    osc.stop(t0 + 0.36);
  }

  toggleCell(r: number, s: number): void {
    this.pattern.update((p) => p.map((row, ri) => (ri === r ? row.map((v, si) => (si === s ? !v : v)) : row)));
  }

  onBpm(e: Event): void {
    this.bpm.set(Number((e.target as HTMLInputElement).value));
    if (this.playing()) this.schedule();
  }

  onWave(e: Event): void {
    this.wave.set((e.target as HTMLSelectElement).value as OscillatorType);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    void this.ctx?.close().catch(() => {});
  }
}
