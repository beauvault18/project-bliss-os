import { Component, inject, OnDestroy, signal } from '@angular/core';
import { WINDOW_VISIBLE } from '../../ng/window-visibility';

interface Ticker {
  sym: string;
  price: number;
}

const CORES = 24;

/**
 * Core-node diagnostics: 24 hardware logging threads with live load bars beside
 * a real-time crypto price ticker. Loads and prices are signals so the zoneless
 * change detector repaints on each tick (mutating plain arrays would not).
 */
@Component({
  selector: 'bliss-diagnostics',
  standalone: true,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .dash {
        box-sizing: border-box;
        height: 100%;
        background: rgba(10, 10, 10, 0.6);
        backdrop-filter: blur(10px);
        color: #d8d8d8;
        font-family: 'Consolas', monospace;
        display: flex;
        padding: 12px;
        gap: 16px;
      }
      .cores {
        flex: 2;
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-auto-rows: min-content;
        gap: 4px 14px;
        align-content: start;
        overflow: hidden;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
      }
      .label {
        color: #7a8;
        width: 46px;
        flex: none;
      }
      .track {
        flex: 1;
        height: 8px;
        background: #1c1c1c;
        border-radius: 2px;
        overflow: hidden;
      }
      .fill {
        height: 100%;
        background: #00ff66;
        transition: width 0.35s ease;
      }
      .fill.mid {
        background: #ffd400;
      }
      .fill.high {
        background: #ff5252;
      }
      .pct {
        width: 34px;
        text-align: right;
        flex: none;
        color: #9aa;
      }
      .ticker {
        flex: 1;
        border-left: 1px solid #2a2a2a;
        padding-left: 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 150px;
      }
      .ticker h4 {
        margin: 0 0 4px;
        font-size: 11px;
        letter-spacing: 1px;
        color: #6cff9e;
        text-transform: uppercase;
      }
      .tick {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: #cfe;
      }
      .tick .v {
        color: #00ff66;
      }
    `,
  ],
  template: `
    <div class="dash">
      <div class="cores">
        @for (load of cores(); track $index) {
          <div class="row">
            <span class="label">CPU{{ pad($index) }}</span>
            <div class="track">
              <div
                class="fill"
                [class.mid]="load > 50 && load <= 80"
                [class.high]="load > 80"
                [style.width.%]="load"
              ></div>
            </div>
            <span class="pct">{{ load }}%</span>
          </div>
        }
      </div>
      <div class="ticker">
        <h4>Crypto Feed</h4>
        @for (t of tickers(); track t.sym) {
          <div class="tick">
            <span>{{ t.sym }}</span>
            <span class="v">{{ fmt(t.price) }}</span>
          </div>
        }
      </div>
    </div>
  `,
})
export class DiagnosticsApp implements OnDestroy {
  readonly cores = signal<number[]>(Array.from({ length: CORES }, () => 12));
  readonly tickers = signal<Ticker[]>([
    { sym: 'BTC', price: 64210.5 },
    { sym: 'ETH', price: 3450.25 },
    { sym: 'SOL', price: 148.9 },
    { sym: 'ADA', price: 0.48 },
    { sym: 'XMR', price: 172.34 },
    { sym: 'DOT', price: 7.21 },
  ]);
  private timer: ReturnType<typeof setInterval>;
  private seed = 9001;
  private visible = inject(WINDOW_VISIBLE);

  constructor() {
    this.timer = setInterval(() => void this.tick(), 600);
  }

  /** One refresh: real per-core CPU from the Electron bridge (cycled onto the 24
   *  display rows), plus the mocked crypto random-walk. Gated on visibility. */
  private async tick(): Promise<void> {
    if (!this.visible()) return; // no churn when off-face/minimized/hidden
    const api = window.electronAPI;
    if (api?.getSystemStats) {
      try {
        const s = await api.getSystemStats();
        const n = s.cores.length || 1;
        this.cores.set(Array.from({ length: CORES }, (_, i) => Math.round(s.cores[i % n] ?? 0)));
      } catch {
        /* keep last values on a failed poll */
      }
    } else {
      // Fallback (non-Electron context): synthetic load.
      this.cores.set(Array.from({ length: CORES }, () => Math.floor(this.rand() * 88) + 6));
    }
    // Crypto prices have no local source — keep the mocked random walk.
    this.tickers.update((ts) =>
      ts.map((t) => ({ ...t, price: Math.max(0.01, t.price * (1 + (this.rand() - 0.5) * 0.02)) })),
    );
  }

  /** Deterministic PRNG — Math.random is unavailable in some build/CI envs. */
  private rand(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  pad(i: number): string {
    return String(i).padStart(2, '0');
  }

  fmt(p: number): string {
    return '$' + p.toLocaleString('en-US', { maximumFractionDigits: p < 1 ? 4 : 2 });
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }
}
