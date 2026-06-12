import { Component, computed, OnDestroy, signal } from '@angular/core';

/**
 * The Conky desktop widget — a non-interactive telemetry overlay painted on
 * the active cube face only, behind the windows. Owns its own zoneless timers:
 * a 1 s clock tick and a 1.5 s poll of the real CPU/RAM over the Electron
 * bridge. Both write signals (zoneless: no CD without a signal write).
 */
@Component({
  selector: 'app-conky',
  standalone: true,
  template: `
    <div class="conky" aria-hidden="true">
      <h1 class="conky__time">{{ clock() }}</h1>
      <p class="conky__line">{{ conkyCpu() }} · {{ conkyRam() }}</p>
      <p class="conky__line">OS Bliss OS 2026 · Ubuntu base</p>
      <p class="conky__line">WM BlissCube · Compiz Engine</p>
    </div>
  `,
})
export class ConkyComponent implements OnDestroy {
  private readonly now = signal(new Date());
  readonly clock = computed(() => {
    const d = this.now();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  private readonly sys = signal<{ cpu: number; ramUsed: number; ramTotal: number } | null>(null);
  readonly conkyCpu = computed(() => {
    const s = this.sys();
    return s ? `CPU ${s.cpu.toFixed(0)}%` : 'CPU --%';
  });
  readonly conkyRam = computed(() => {
    const s = this.sys();
    if (!s) return 'RAM -- / -- GB';
    const gb = (b: number) => (b / 1e9).toFixed(1);
    return `RAM ${gb(s.ramUsed)} / ${(s.ramTotal / 1e9).toFixed(0)} GB`;
  });

  private clockTimer = setInterval(() => this.now.set(new Date()), 1000);
  private statsTimer: ReturnType<typeof setInterval>;

  constructor() {
    const pollStats = () =>
      void window.electronAPI?.getSystemStats?.().then((s) => this.sys.set(s)).catch(() => {});
    pollStats();
    this.statsTimer = setInterval(pollStats, 1500);
  }

  ngOnDestroy(): void {
    clearInterval(this.clockTimer);
    clearInterval(this.statsTimer);
  }
}
