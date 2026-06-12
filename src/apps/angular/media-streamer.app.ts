import { AfterViewInit, Component, ElementRef, effect, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { WINDOW_VISIBLE } from '../../ng/window-visibility';

/**
 * A REAL media player: a bundled looping clip (Big Buck Bunny © Blender
 * Foundation, CC-BY — trimmed/transcoded locally, served same-origin under
 * the existing CSP) in a <video> with themed custom controls and a live
 * WebAudio AnalyserNode spectrum visualizer driven by the clip's actual
 * audio track. The visualizer RAF gates on WINDOW_VISIBLE like every app.
 */
@Component({
  selector: 'bliss-media-streamer',
  standalone: true,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .wrap {
        width: 100%;
        height: 100%;
        background: rgba(5, 5, 5, 0.45);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .player {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        max-height: 100%;
        background: #000;
        overflow: hidden;
      }
      video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .viz {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 26px;
        height: 56px;
        width: 100%;
        pointer-events: none;
        opacity: 0.85;
      }
      .live {
        position: absolute;
        top: 12px;
        left: 12px;
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(220, 0, 30, 0.9);
        color: #fff;
        padding: 4px 9px;
        font: bold 11px/1 var(--font-ui, sans-serif);
        letter-spacing: 0.5px;
        border-radius: 3px;
        z-index: 2;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #fff;
        animation: pulse 1.2s ease-in-out infinite;
      }
      @keyframes pulse {
        50% {
          opacity: 0.25;
        }
      }
      .credit {
        position: absolute;
        top: 12px;
        right: 12px;
        color: rgba(255, 255, 255, 0.75);
        font: 500 10px/1.2 var(--font-mono, monospace);
        text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
        z-index: 2;
      }
      .controls {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 10px;
        background: linear-gradient(transparent, rgba(0, 0, 0, 0.75));
        z-index: 3;
      }
      .ctl {
        border: none;
        background: none;
        color: #fff;
        font-size: 0.95rem;
        cursor: pointer;
        padding: 2px 4px;
        text-shadow: 0 0 6px rgba(var(--accent-rgb), 0.8);
      }
      .seek {
        flex: 1;
        accent-color: var(--accent);
        height: 4px;
      }
      .vol {
        width: 70px;
        accent-color: var(--accent);
        height: 4px;
      }
      .time {
        color: #fff;
        font: 500 10px/1 var(--font-mono, monospace);
        min-width: 64px;
        text-align: right;
      }
    `,
  ],
  template: `
    <div class="wrap">
      <div class="player">
        <video
          #vid
          src="media/demo-loop.webm"
          loop
          autoplay
          [muted]="muted()"
          (timeupdate)="onTime()"
          (click)="togglePlay()"
          data-testid="media-video"
        ></video>
        <canvas #viz class="viz"></canvas>
        <span class="live"><span class="dot"></span>MEDIA ENGINE</span>
        <span class="credit">Big Buck Bunny · © Blender Foundation (CC-BY)</span>
        <div class="controls">
          <button class="ctl" (click)="togglePlay()">{{ playing() ? '⏸' : '▶' }}</button>
          <input
            class="seek"
            type="range"
            min="0"
            max="1000"
            [value]="progress()"
            (input)="onSeek($event)"
          />
          <span class="time">{{ timeLabel() }}</span>
          <button class="ctl" (click)="toggleMute()">{{ muted() ? '🔇' : '🔊' }}</button>
          <input class="vol" type="range" min="0" max="100" [value]="vol()" (input)="onVol($event)" />
        </div>
      </div>
    </div>
  `,
})
export class MediaStreamerApp implements AfterViewInit, OnDestroy {
  readonly playing = signal(true);
  readonly muted = signal(true); // start muted (polite autoplay); analyser still sees audio
  readonly vol = signal(70);
  readonly progress = signal(0);
  readonly timeLabel = signal('0:00 / 0:00');

  @ViewChild('vid') private vid?: ElementRef<HTMLVideoElement>;
  @ViewChild('viz') private viz?: ElementRef<HTMLCanvasElement>;

  private visible = inject(WINDOW_VISIBLE);
  private raf = 0;
  private actx?: AudioContext;
  private analyser?: AnalyserNode;

  constructor() {
    // Pause playback (not just the visualizer) when off-face/minimized/hidden.
    effect(() => {
      const v = this.vid?.nativeElement;
      if (!v) return;
      if (!this.visible()) {
        v.pause();
      } else if (this.playing()) {
        void v.play().catch(() => {});
      }
    });
  }

  ngAfterViewInit(): void {
    const v = this.vid!.nativeElement;
    v.volume = this.vol() / 100;
    // Wire the clip's audio through an analyser for the spectrum bars. A
    // failure here (no audio device in CI) must never break playback.
    try {
      this.actx = new AudioContext();
      const src = this.actx.createMediaElementSource(v);
      this.analyser = this.actx.createAnalyser();
      this.analyser.fftSize = 128;
      src.connect(this.analyser);
      this.analyser.connect(this.actx.destination);
    } catch {
      this.analyser = undefined;
    }
    const cvs = this.viz!.nativeElement;
    const g = cvs.getContext('2d');
    const data = new Uint8Array(this.analyser?.frequencyBinCount ?? 64);
    const accent = () =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00c8ff';
    const draw = () => {
      this.raf = requestAnimationFrame(draw);
      if (!g || !this.visible()) return;
      const w = (cvs.width = cvs.clientWidth || 600);
      const h = (cvs.height = cvs.clientHeight || 56);
      g.clearRect(0, 0, w, h);
      if (this.analyser) this.analyser.getByteFrequencyData(data);
      const n = 48;
      const bw = w / n;
      g.fillStyle = accent();
      for (let i = 0; i < n; i++) {
        const v01 = (data[i] ?? 0) / 255;
        const bh = Math.max(2, v01 * h);
        g.globalAlpha = 0.35 + v01 * 0.6;
        g.fillRect(i * bw + 1, h - bh, bw - 2, bh);
      }
      g.globalAlpha = 1;
    };
    draw();
  }

  togglePlay(): void {
    const v = this.vid?.nativeElement;
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => {});
      void this.actx?.resume().catch(() => {});
      this.playing.set(true);
    } else {
      v.pause();
      this.playing.set(false);
    }
  }

  toggleMute(): void {
    this.muted.update((m) => !m);
    void this.actx?.resume().catch(() => {});
  }

  onVol(e: Event): void {
    const val = Number((e.target as HTMLInputElement).value);
    this.vol.set(val);
    const v = this.vid?.nativeElement;
    if (v) v.volume = val / 100;
  }

  onSeek(e: Event): void {
    const v = this.vid?.nativeElement;
    if (!v || !v.duration) return;
    v.currentTime = (Number((e.target as HTMLInputElement).value) / 1000) * v.duration;
  }

  onTime(): void {
    const v = this.vid?.nativeElement;
    if (!v || !v.duration) return;
    this.progress.set(Math.round((v.currentTime / v.duration) * 1000));
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    this.timeLabel.set(`${fmt(v.currentTime)} / ${fmt(v.duration)}`);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    void this.actx?.close().catch(() => {});
  }
}
