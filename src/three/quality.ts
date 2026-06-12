import type * as THREE from 'three';

export type Tier = 'low' | 'med' | 'high' | 'ultra';

export interface TierConfig {
  /** Procedural shader nebula (true) vs the cheap canvas-texture galaxy. */
  shaderSky: boolean;
  dustCount: number;
  shootingStars: boolean;
  /** undefined composer = direct render (the SwiftShader contract). */
  composer: 'none' | 'bloom' | 'full';
  setPieces: boolean; // aurora / sun / digital rain (per theme flags)
  dprCap: number;
}

export const TIERS: Record<Tier, TierConfig> = {
  low: { shaderSky: false, dustCount: 200, shootingStars: false, composer: 'none', setPieces: false, dprCap: 1 },
  med: { shaderSky: false, dustCount: 400, shootingStars: false, composer: 'bloom', setPieces: false, dprCap: 1.5 },
  high: { shaderSky: true, dustCount: 800, shootingStars: true, composer: 'full', setPieces: true, dprCap: 2 },
  ultra: { shaderSky: true, dustCount: 1200, shootingStars: true, composer: 'full', setPieces: true, dprCap: 2 },
};

/** Software GL (SwiftShader/llvmpipe — headless CI, GPU-less VMs) is detected
 *  synchronously at construction and pins the scene to LOW with no composer,
 *  preserving the original fallback contract exactly. */
export function isSoftwareGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(
      (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '',
    );
    return /swiftshader|software|llvmpipe/i.test(name);
  } catch {
    return true; // can't even introspect → assume the worst
  }
}

const WARMUP_MS = 2000;
const SAMPLE_MS = 3000;
const RECHECK_MS = 30000;

/**
 * Frame-rate governor: samples fps after a warm-up to pick an auto tier
 * (single-step hysteresis, one re-check at 30 s), and independently nudges
 * the render resolution (DPR) against a rolling average so heavy moments
 * degrade resolution before they degrade smoothness.
 */
export class FpsGovernor {
  private start = performance.now();
  private sampleStart = 0;
  private frames = 0;
  private decided = false;
  private rechecked = false;
  /** Rolling frame-time window for adaptive DPR. */
  private recent: number[] = [];
  private lastFrame = 0;
  dpr = 1;

  constructor(
    private dprCap: () => number,
    private onTier: (tier: Tier) => void,
  ) {
    this.dpr = Math.min(devicePixelRatio || 1, this.dprCap());
  }

  /** Call once per rendered frame. Returns a new DPR when it should change. */
  tick(now: number): number | null {
    // --- auto-tier sampling ---
    const since = now - this.start;
    if (!this.decided && since > WARMUP_MS) {
      if (this.sampleStart === 0) this.sampleStart = now;
      this.frames++;
      const span = now - this.sampleStart;
      if (span >= SAMPLE_MS) {
        const fps = (this.frames / span) * 1000;
        this.decided = true;
        this.onTier(fps < 28 ? 'low' : fps < 45 ? 'med' : fps < 58 ? 'high' : 'ultra');
        if (!this.rechecked) {
          this.rechecked = true;
          setTimeout(() => {
            this.decided = false;
            this.sampleStart = 0;
            this.frames = 0;
          }, RECHECK_MS);
        }
      }
    }
    // --- adaptive DPR (rolling 60-frame window) ---
    if (this.lastFrame > 0) {
      this.recent.push(now - this.lastFrame);
      if (this.recent.length > 60) this.recent.shift();
    }
    this.lastFrame = now;
    if (this.recent.length === 60) {
      const avg = this.recent.reduce((a, b) => a + b, 0) / 60;
      const fps = 1000 / avg;
      const cap = Math.min(devicePixelRatio || 1, this.dprCap());
      if (fps < 50 && this.dpr > 1) {
        this.dpr = Math.max(1, this.dpr - 0.25);
        this.recent.length = 0;
        return this.dpr;
      }
      if (fps > 58 && this.dpr < cap) {
        this.dpr = Math.min(cap, this.dpr + 0.25);
        this.recent.length = 0;
        return this.dpr;
      }
    }
    return null;
  }
}
