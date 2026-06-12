import { Component, inject, OnDestroy, signal } from '@angular/core';
import { WINDOW_VISIBLE } from '../../ng/window-visibility';

interface Candle {
  open: number;
  close: number;
  high: number;
  low: number;
}

const COUNT = 48;

/**
 * Volatile candlestick interface on a deep-charcoal grid (#121212). Candles are
 * held in a signal and shifted left on a timer so the tape scrolls and the last
 * bar keeps re-printing — a cheap stand-in for a live market feed. Green/red bars
 * map to up/down closes; geometry is computed as percentages so it scales with
 * the window.
 */
@Component({
  selector: 'bliss-market-charts',
  standalone: true,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .chart {
        box-sizing: border-box;
        height: 100%;
        background: rgba(18, 18, 18, 0.66);
        backdrop-filter: blur(10px);
        background-image: linear-gradient(#1c1c1c 1px, transparent 1px),
          linear-gradient(90deg, #1c1c1c 1px, transparent 1px);
        background-size: 100% 12.5%, 4% 100%;
        font-family: 'Consolas', monospace;
        color: #cfd6e0;
        display: flex;
        flex-direction: column;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 8px 12px 4px;
      }
      .sym {
        font-weight: bold;
        font-size: 14px;
        letter-spacing: 1px;
      }
      .price {
        font-size: 16px;
        font-weight: bold;
      }
      .up {
        color: #2ec27e;
      }
      .down {
        color: #d83a52;
      }
      .src {
        font: bold 10px/1 var(--font-mono, monospace);
        letter-spacing: 0.08em;
        padding: 3px 7px;
        border-radius: 3px;
        margin-left: 10px;
        vertical-align: 2px;
      }
      .src--live {
        color: #06281a;
        background: #2ec27e;
        box-shadow: 0 0 8px rgba(46, 194, 126, 0.7);
      }
      .src--sim {
        color: #cfd6e0;
        background: rgba(255, 255, 255, 0.14);
      }
      .bars {
        flex: 1;
        display: flex;
        align-items: stretch;
        gap: 2px;
        padding: 6px 10px 12px;
        min-height: 0;
      }
      .col {
        flex: 1;
        position: relative;
      }
      .wick {
        position: absolute;
        left: 50%;
        width: 1px;
        transform: translateX(-50%);
        background: currentColor;
        opacity: 0.7;
      }
      .body {
        position: absolute;
        left: 15%;
        width: 70%;
        min-height: 1px;
        background: currentColor;
        border-radius: 1px;
      }
    `,
  ],
  template: `
    <div class="chart">
      <div class="head">
        <span class="sym"
          >BTC/USDT · 1m<span class="src" [class.src--live]="live()" [class.src--sim]="!live()" data-testid="market-src">{{
            live() ? 'LIVE' : 'SIM'
          }}</span></span
        >
        <span class="price" [class.up]="last().close >= last().open" [class.down]="last().close < last().open">
          {{ priceLabel() }}
        </span>
      </div>
      <div class="bars">
        @for (c of candles(); track $index) {
          <div class="col" [class.up]="c.close >= c.open" [class.down]="c.close < c.open">
            <div
              class="wick"
              [style.top.%]="pct(c.high)"
              [style.height.%]="pct(c.low) - pct(c.high)"
            ></div>
            <div
              class="body"
              [style.top.%]="pct(Math.max(c.open, c.close))"
              [style.height.%]="Math.abs(pct(c.open) - pct(c.close))"
            ></div>
          </div>
        }
      </div>
    </div>
  `,
})
export class MarketChartsApp implements OnDestroy {
  readonly Math = Math; // expose to template for clamp math
  readonly candles = signal<Candle[]>([]);
  readonly last = signal<Candle>({ open: 64000, close: 64000, high: 64000, low: 64000 });
  /** True when the tape is the real Binance feed (via market:candles in main);
   *  false = the deterministic SIM walk (offline / browser / fetch failure). */
  readonly live = signal(false);
  private timer: ReturnType<typeof setInterval>;
  private liveTimer?: ReturnType<typeof setInterval>;
  private price = 64000;
  private lo = 0;
  private hi = 1;
  private seed = 1337;
  private visible = inject(WINDOW_VISIBLE);

  constructor() {
    const init: Candle[] = [];
    for (let i = 0; i < COUNT; i++) init.push(this.step());
    this.candles.set(init);
    this.recalcRange(init);
    this.timer = setInterval(() => {
      if (!this.visible() || this.live()) return; // SIM tape only while not live
      this.candles.update((cs) => {
        const next = [...cs.slice(1), this.step()];
        this.recalcRange(next);
        return next;
      });
    }, 700);
    // Try the real feed (main-process fetch, cached); fall back silently.
    const poll = async () => {
      if (!this.visible()) return;
      const api = window.electronAPI?.market;
      if (!api) return;
      try {
        const res = await api.candles({ symbol: 'BTCUSDT', interval: '1m' });
        if (res.source === 'live' && res.candles.length) {
          const cs = res.candles.slice(-COUNT);
          this.candles.set(cs);
          this.last.set(cs[cs.length - 1]);
          this.recalcRange(cs);
          this.live.set(true);
        } else {
          this.live.set(false);
        }
      } catch {
        this.live.set(false);
      }
    };
    void poll();
    this.liveTimer = setInterval(() => void poll(), 20_000);
  }

  /** Deterministic PRNG — Math.random is unavailable in some build/CI envs. */
  private rand(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  private step(): Candle {
    const open = this.price;
    const drift = (this.rand() - 0.5) * 900;
    const close = Math.max(1000, open + drift);
    const high = Math.max(open, close) + this.rand() * 300;
    const low = Math.min(open, close) - this.rand() * 300;
    this.price = close;
    const c = { open, close, high, low };
    this.last.set(c);
    return c;
  }

  private recalcRange(cs: Candle[]): void {
    this.lo = Math.min(...cs.map((c) => c.low));
    this.hi = Math.max(...cs.map((c) => c.high));
  }

  priceLabel(): string {
    return '$' + this.last().close.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  /** Value → vertical % from the top (0 = chart top). */
  pct(v: number): number {
    const span = this.hi - this.lo || 1;
    return ((this.hi - v) / span) * 100;
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    clearInterval(this.liveTimer);
  }
}
