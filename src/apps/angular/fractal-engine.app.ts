import { AfterViewInit, Component, ElementRef, inject, OnDestroy, ViewChild } from '@angular/core';
import { WINDOW_VISIBLE } from '../../ng/window-visibility';

/**
 * Real-time Mandelbrot generator with electric-green tendrils (XaoS look). The
 * escape-iteration buffer is computed once per size (expensive), then each frame
 * only re-maps that buffer through a neon palette with an animated offset — so
 * the tendrils shimmer continuously without recomputing the set every frame.
 */
@Component({
  selector: 'bliss-fractal-engine',
  standalone: true,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        background: rgba(6, 10, 18, 0.45);
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
export class FractalEngineApp implements AfterViewInit, OnDestroy {
  @ViewChild('c', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private ro?: ResizeObserver;
  private raf = 0;
  private iters = new Uint16Array(0); // escape count per pixel
  private cw = 0;
  private ch = 0;
  private readonly maxIter = 80;
  private phase = 0;
  private visible = inject(WINDOW_VISIBLE);

  ngAfterViewInit(): void {
    const cvs = this.canvasRef.nativeElement;
    this.ctx = cvs.getContext('2d')!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(cvs);
    this.resize();
    this.loop();
  }

  private resize(): void {
    const cvs = this.canvasRef.nativeElement;
    // Render at a capped internal resolution for speed; CSS scales it up.
    const w = Math.max(1, Math.min(360, Math.floor(cvs.clientWidth / 2)));
    const h = Math.max(1, Math.min(280, Math.floor(cvs.clientHeight / 2)));
    if (w === this.cw && h === this.ch) return;
    this.cw = cvs.width = w;
    this.ch = cvs.height = h;
    this.compute();
  }

  /** One-time escape-iteration pass over the classic Mandelbrot window. */
  private compute(): void {
    const { cw: w, ch: h, maxIter } = this;
    this.iters = new Uint16Array(w * h);
    const minRe = -2.2;
    const maxRe = 1.0;
    const minIm = -1.25;
    const maxIm = 1.25;
    for (let py = 0; py < h; py++) {
      const c_im = minIm + (py / h) * (maxIm - minIm);
      for (let px = 0; px < w; px++) {
        const c_re = minRe + (px / w) * (maxRe - minRe);
        let re = 0;
        let im = 0;
        let n = 0;
        while (n < maxIter && re * re + im * im <= 4) {
          const re2 = re * re - im * im + c_re;
          im = 2 * re * im + c_im;
          re = re2;
          n++;
        }
        this.iters[py * w + px] = n;
      }
    }
  }

  private loop = (): void => {
    // Skip the per-frame palette map + putImageData when off-face/minimized/hidden.
    if (!this.visible()) {
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    this.phase = (this.phase + 0.015) % 1;
    const { cw: w, ch: h, maxIter, iters } = this;
    const img = this.ctx.createImageData(w, h);
    const data = img.data;
    for (let i = 0; i < iters.length; i++) {
      const n = iters[i];
      const o = i * 4;
      if (n >= maxIter) {
        // Inside the set: fully transparent so the glass body + skybox grid
        // show through the iconic black interior (holographic look).
        data[o] = data[o + 1] = data[o + 2] = 0;
        data[o + 3] = 0;
        continue;
      }
      // Neon-green ramp with an animated phase → living electric tendrils.
      const t = (n / maxIter + this.phase) % 1;
      const g = 80 + Math.floor(175 * t);
      data[o] = Math.floor(g * 0.15); // a hint of cyan/yellow at the edges
      data[o + 1] = g;
      data[o + 2] = Math.floor(g * 0.25);
      data[o + 3] = 255;
    }
    this.ctx.putImageData(img, 0, 0);
    this.raf = requestAnimationFrame(this.loop);
  };

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
  }
}
