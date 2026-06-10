import { AfterViewInit, Component, ElementRef, inject, OnDestroy, ViewChild } from '@angular/core';
import { WINDOW_VISIBLE } from '../../ng/window-visibility';

interface Orbit {
  rx: number; // ellipse radii as a fraction of min(cw,ch)
  ry: number;
  color: string;
  speed: number;
  angle: number;
  tilt: number;
}

/**
 * Deep-space tracking simulator: a glowing planet ringed by red and blue
 * elliptical orbital paths with tracked bodies sweeping along them, over a
 * parallax starfield. Pure 2D canvas — no extra WebGL context, no Three.js
 * scene to tear down when the window closes.
 */
@Component({
  selector: 'bliss-space-tracker',
  standalone: true,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        background: rgba(2, 4, 10, 0.5);
        backdrop-filter: blur(8px);
      }
      canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
    `,
  ],
  template: `<canvas #c></canvas>`,
})
export class SpaceTrackerApp implements AfterViewInit, OnDestroy {
  @ViewChild('c', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private ro?: ResizeObserver;
  private raf = 0;
  private cw = 0;
  private ch = 0;
  private stars: { x: number; y: number; r: number }[] = [];
  private visible = inject(WINDOW_VISIBLE);
  private readonly orbits: Orbit[] = [
    { rx: 0.78, ry: 0.34, color: '#ff3b5c', speed: 0.012, angle: 0, tilt: -0.32 },
    { rx: 0.5, ry: 0.6, color: '#3b8cff', speed: 0.02, angle: 1.6, tilt: 0.45 },
  ];

  ngAfterViewInit(): void {
    const cvs = this.canvasRef.nativeElement;
    this.ctx = cvs.getContext('2d', { alpha: true })!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(cvs);
    this.resize();
    this.loop();
  }

  private resize(): void {
    const cvs = this.canvasRef.nativeElement;
    const w = Math.max(1, Math.floor(cvs.clientWidth));
    const h = Math.max(1, Math.floor(cvs.clientHeight));
    if (w === this.cw && h === this.ch) return;
    this.cw = cvs.width = w;
    this.ch = cvs.height = h;
    // Deterministic starfield seeded off pixel index (Math.random is unavailable
    // in some envs, and this keeps the field stable across resizes).
    this.stars = Array.from({ length: 140 }, (_, i) => {
      const a = (i * 2654435761) >>> 0;
      return {
        x: (a % 1000) / 1000 * w,
        y: ((a >>> 10) % 1000) / 1000 * h,
        r: ((a >>> 20) % 3) * 0.4 + 0.3,
      };
    });
  }

  private loop = (): void => {
    // Skip the canvas redraw when off-face/minimized/hidden.
    if (!this.visible()) {
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    const { ctx, cw: w, ch: h } = this;
    const cx = w / 2;
    const cy = h / 2;
    const base = Math.min(w, h) / 2;

    // Clear to transparent so the glass body + skybox grid show through space.
    ctx.clearRect(0, 0, w, h);

    // Starfield.
    ctx.fillStyle = '#9fb4d8';
    for (const s of this.stars) {
      ctx.globalAlpha = 0.4 + (s.r % 0.5);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Orbital paths + tracked bodies.
    for (const o of this.orbits) {
      o.angle += o.speed;
      const rx = o.rx * base;
      const ry = o.ry * base;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(o.tilt);
      ctx.strokeStyle = o.color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Tracked body.
      const bx = Math.cos(o.angle) * rx;
      const by = Math.sin(o.angle) * ry;
      ctx.globalAlpha = 1;
      ctx.shadowColor = o.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = o.color;
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
    }

    // Central planet.
    const grad = ctx.createRadialGradient(
      cx - base * 0.08,
      cy - base * 0.08,
      base * 0.02,
      cx,
      cy,
      base * 0.26,
    );
    grad.addColorStop(0, '#7fd4ff');
    grad.addColorStop(0.5, '#1f6fae');
    grad.addColorStop(1, '#06243c');
    ctx.shadowColor = '#2aa3ff';
    ctx.shadowBlur = 30;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, base * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    this.raf = requestAnimationFrame(this.loop);
  };

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
  }
}
