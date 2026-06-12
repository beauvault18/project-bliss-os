import { effect, inject, Injectable, signal } from '@angular/core';
import { SettingsService } from './settings.service';

/** Smoothed head pose, all axes -1..1 (x: +1 = head physically to YOUR right,
 *  y: +1 = head up, depth: +1 = leaning in toward the screen). */
export interface HeadPose {
  x: number;
  y: number;
  depth: number;
}

/** Chromium's Shape Detection API (available behind the scenes on macOS). */
interface FaceDetectorLike {
  detect(src: CanvasImageSource): Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
}

const ZERO: HeadPose = { x: 0, y: 0, depth: 0 };
const DETECT_MS = 90; // ~11 Hz detection; the rAF smoother upsamples to 60
/** Time-based easing rate (per second) — frame-rate independent, so the
 *  smoother converges identically at 60 fps or in a throttled hidden window. */
const SMOOTH_RATE = 7;

/**
 * Head-coupled parallax (the Johnny Lee "window" effect). A low-res webcam
 * feed is analyzed ON-DEVICE — nothing is recorded, stored, or sent anywhere;
 * frames live in one small canvas and are overwritten ~11×/second. Detection
 * is tiered: Chromium's native FaceDetector when present, else a skin-tone
 * centroid fallback (coarser, but fine for parallax).
 *
 * Output is one smoothed `head` signal that the desktop fans out to the WebGL
 * camera, the cube-viewport's perspective-origin, and the Conky widget.
 * `injectHead()` drives the same pipeline without a camera (the test seam).
 */
@Injectable({ providedIn: 'root' })
export class HeadTrackingService {
  private settings = inject(SettingsService);

  /** Smoothed pose for consumers (eased at rAF rate toward the detector). */
  readonly head = signal<HeadPose>(ZERO);
  /** True while the camera is actually streaming (the tray 📷 indicator). */
  readonly active = signal(false);
  /** Diagnostics for __bliss.headState() and the terminal `head` command. */
  readonly status = signal<{
    camera: 'off' | 'starting' | 'on' | 'denied';
    mode: 'facedetector' | 'skin' | 'none';
    hits: number; // successful detections
    misses: number; // ticks with no face found
    lastError: string;
    video: string; // readyState + dimensions, refreshed per tick
  }>({ camera: 'off', mode: 'none', hits: 0, misses: 0, lastError: '', video: '' });

  private target: HeadPose = ZERO;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas = document.createElement('canvas');
  private detector: FaceDetectorLike | null = null;
  private detecting = false;
  private detectTimer: ReturnType<typeof setInterval> | undefined;
  private raf = 0;
  private rafRunning = false;
  private starting = false;

  constructor() {
    this.canvas.width = 96;
    this.canvas.height = 72;
    effect(() => {
      const on = this.settings.headTracking();
      if (on) void this.start();
      else this.stop();
    });
    // A hidden window never opens the camera (headless harnesses, minimized
    // boots) — retry when we become visible and tracking is wanted.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.settings.headTracking() && !this.stream) void this.start();
    });
  }

  /** Test seam: drive the pose pipeline directly (no camera involved). */
  injectHead(x: number, y: number, depth = 0): void {
    this.target = {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
      depth: Math.max(-1, Math.min(1, depth)),
    };
    this.ensureSmoother();
  }

  private async start(): Promise<void> {
    if (this.stream || this.starting || document.hidden) return;
    this.starting = true;
    this.status.update((s) => ({ ...s, camera: 'starting' }));
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, frameRate: 15 },
        audio: false,
      });
    } catch (err) {
      // No camera / permission denied / headless CI — stay gracefully inert.
      this.stream = null;
      this.starting = false;
      this.active.set(false);
      this.status.update((s) => ({
        ...s,
        camera: 'denied',
        lastError: err instanceof Error ? `${err.name}: ${err.message}` : 'getUserMedia failed',
      }));
      return;
    }
    this.starting = false;
    this.status.update((s) => ({ ...s, camera: 'on' }));
    const video = document.createElement('video');
    video.srcObject = this.stream;
    video.muted = true;
    void video.play().catch(() => {});
    this.video = video;
    const FD = (window as unknown as { FaceDetector?: new (o?: object) => FaceDetectorLike })
      .FaceDetector;
    if (FD) {
      try {
        this.detector = new FD({ fastMode: true, maxDetectedFaces: 1 });
      } catch {
        this.detector = null;
      }
    }
    this.active.set(true);
    this.detectTimer = setInterval(() => void this.detect(), DETECT_MS);
    this.ensureSmoother();
  }

  private stop(): void {
    clearInterval(this.detectTimer);
    this.detectTimer = undefined;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video = null;
    this.detector = null;
    this.active.set(false);
    this.status.update((s) => ({ ...s, camera: 'off', mode: 'none' }));
    this.target = ZERO; // ease back to center, then the smoother parks itself
    this.ensureSmoother();
  }

  private async detect(): Promise<void> {
    const video = this.video;
    this.status.update((s) => ({
      ...s,
      video: video
        ? `rs=${video.readyState} ${video.videoWidth}x${video.videoHeight} det=${!!this.detector} busy=${this.detecting}`
        : 'none',
    }));
    if (!video || video.readyState < 2 || this.detecting || document.hidden) return;
    this.detecting = true;
    try {
      if (this.detector) {
        // Race a watchdog: a stub FaceDetector that never resolves must not
        // wedge the loop (the `detecting` flag would stick forever).
        const faces = await Promise.race([
          this.detector.detect(video),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('detect timeout')), 600)),
        ]);
        const f = faces[0]?.boundingBox;
        if (f) {
          const vw = video.videoWidth || 320;
          const vh = video.videoHeight || 240;
          const cx = (f.x + f.width / 2) / vw;
          const cy = (f.y + f.height / 2) / vh;
          // Webcam images are unmirrored: head-right appears left in frame.
          this.setTarget(-(cx * 2 - 1), -(cy * 2 - 1), (f.width / vw - 0.32) * 3);
          this.status.update((s) => ({ ...s, mode: 'facedetector', hits: s.hits + 1 }));
          return;
        }
        // A FaceDetector that exists but never lands a face (common — the
        // Shape Detection API is a stub on some platforms) must NOT block
        // tracking: fall through to the skin-centroid fallback this tick.
      }
      this.detectSkinCentroid(video);
    } catch (err) {
      // FaceDetector flaked — drop to the fallback permanently.
      this.detector = null;
      this.status.update((s) => ({
        ...s,
        lastError: err instanceof Error ? `${err.name}: ${err.message}` : 'detect failed',
      }));
    } finally {
      this.detecting = false;
    }
  }

  /** Fallback: skin-tone centroid + coverage on a 96×72 thumbnail. Coarse but
   *  plenty for parallax, and it needs no API at all. */
  private detectSkinCentroid(video: HTMLVideoElement): void {
    const g = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    g.drawImage(video, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h).data;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        const r = data[i];
        const gg = data[i + 1];
        const b = data[i + 2];
        // Classic RGB skin classifier (Peer et al.) — permissive on purpose.
        if (r > 95 && gg > 40 && b > 20 && r > gg && r > b && Math.abs(r - gg) > 15) {
          sx += x;
          sy += y;
          n++;
        }
      }
    }
    const sampled = (w / 2) * (h / 2);
    if (n < sampled * 0.02) {
      this.status.update((s) => ({ ...s, misses: s.misses + 1 }));
      return; // no plausible face — hold the last pose
    }
    const cx = sx / n / w;
    const cy = sy / n / h;
    const coverage = n / sampled; // bigger face = closer
    this.setTarget(-(cx * 2 - 1), -(cy * 2 - 1), (coverage - 0.18) * 4);
    this.status.update((s) => ({ ...s, mode: 'skin', hits: s.hits + 1 }));
  }

  /** Detection-space gain: a face center only sweeps ~±0.25 of the frame for
   *  normal head motion, so amplify into the full -1..1 pose range or the
   *  parallax is imperceptible. */
  private static readonly GAIN = 2.6;

  private setTarget(x: number, y: number, depth: number): void {
    const g = HeadTrackingService.GAIN;
    this.target = {
      x: Math.max(-1, Math.min(1, x * g)),
      y: Math.max(-1, Math.min(1, y * g)),
      depth: Math.max(-1, Math.min(1, depth)),
    };
    this.ensureSmoother();
  }

  /** Eases toward the detector's last fix; parks itself at rest. Time-based
   *  (exp decay over dt), so a throttled/hidden window still converges. */
  private ensureSmoother(): void {
    if (this.rafRunning) return;
    this.rafRunning = true;
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      const k = 1 - Math.exp(-SMOOTH_RATE * dt);
      const cur = this.head();
      const dx = this.target.x - cur.x;
      const dy = this.target.y - cur.y;
      const dd = this.target.depth - cur.depth;
      const settled = Math.abs(dx) < 0.002 && Math.abs(dy) < 0.002 && Math.abs(dd) < 0.002;
      if (settled && !this.detectTimer) {
        this.head.set(this.target);
        this.rafRunning = false; // parked (camera off and settled)
        return;
      }
      if (!settled) {
        // Only write while moving — a still head costs zero change detection.
        this.head.set({
          x: cur.x + dx * k,
          y: cur.y + dy * k,
          depth: cur.depth + dd * k,
        });
      }
      // rAF for vsync smoothness in the foreground, with a timer backstop so
      // hidden/throttled windows (the smoke harness) still advance.
      this.raf = requestAnimationFrame(step);
      if (document.hidden) setTimeout(() => {
        cancelAnimationFrame(this.raf);
        step();
      }, 50);
    };
    step();
  }
}
