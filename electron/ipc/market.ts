import type { IpcMain } from 'electron';
import { isString } from './validate';

/**
 * Live market data with a deterministic offline story. The MAIN process
 * fetches from a hardcoded host allowlist (Binance public REST — no key),
 * shape-validates everything to plain bounded numbers, and caches ~45 s.
 * On ANY failure the channel returns { source: 'fallback' } and the renderer
 * keeps its existing seeded random-walk — so the app is always alive, and
 * shows a LIVE vs SIM badge truthfully. No CSP change: the renderer never
 * talks to the network.
 */

export const MARKET_CH = {
  candles: 'market:candles',
  ticker: 'market:ticker',
} as const;

const HOST = 'https://api.binance.com'; // the ONLY market egress host
const SYMBOLS = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'XMRUSDT', 'DOTUSDT']);
const INTERVALS = new Set(['1m', '5m', '15m', '1h']);
const CACHE_MS = 45_000;
const FETCH_TIMEOUT_MS = 5_000;

export interface Candle {
  open: number;
  close: number;
  high: number;
  low: number;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? n : null;
};

const cache = new Map<string, { at: number; data: unknown }>();

async function fetchJson(url: string): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ac.signal });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function registerMarket(ipcMain: IpcMain): void {
  ipcMain.handle(
    MARKET_CH.candles,
    async (_e, req: unknown): Promise<{ source: 'live'; candles: Candle[] } | { source: 'fallback' }> => {
      const symbol = (req as { symbol?: unknown })?.symbol;
      const interval = (req as { interval?: unknown })?.interval;
      if (!isString(symbol) || !SYMBOLS.has(symbol)) return { source: 'fallback' };
      const iv = isString(interval) && INTERVALS.has(interval) ? interval : '1m';
      if (process.env['BLISS_MARKET_OFFLINE'] === '1') return { source: 'fallback' };
      const key = `c:${symbol}:${iv}`;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_MS) return hit.data as { source: 'live'; candles: Candle[] };
      const raw = await fetchJson(`${HOST}/api/v3/klines?symbol=${symbol}&interval=${iv}&limit=48`);
      if (!Array.isArray(raw) || raw.length === 0) return { source: 'fallback' };
      const candles: Candle[] = [];
      for (const k of raw.slice(0, 96)) {
        if (!Array.isArray(k)) return { source: 'fallback' };
        const open = num(k[1]);
        const high = num(k[2]);
        const low = num(k[3]);
        const close = num(k[4]);
        if (open === null || high === null || low === null || close === null) return { source: 'fallback' };
        candles.push({ open, high, low, close });
      }
      const data = { source: 'live' as const, candles };
      cache.set(key, { at: Date.now(), data });
      return data;
    },
  );

  ipcMain.handle(
    MARKET_CH.ticker,
    async (_e, req: unknown): Promise<{ source: 'live'; prices: Record<string, number> } | { source: 'fallback' }> => {
      const symbols = Array.isArray(req) ? req.filter((s) => isString(s) && SYMBOLS.has(s)) : [];
      if (!symbols.length || process.env['BLISS_MARKET_OFFLINE'] === '1') return { source: 'fallback' };
      const key = `t:${symbols.join(',')}`;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_MS / 3) return hit.data as { source: 'live'; prices: Record<string, number> };
      const raw = await fetchJson(
        `${HOST}/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`,
      );
      if (!Array.isArray(raw)) return { source: 'fallback' };
      const prices: Record<string, number> = {};
      for (const t of raw) {
        const sym = (t as { symbol?: unknown })?.symbol;
        const price = num((t as { price?: unknown })?.price);
        if (isString(sym) && SYMBOLS.has(sym) && price !== null) prices[sym] = price;
      }
      if (!Object.keys(prices).length) return { source: 'fallback' };
      const data = { source: 'live' as const, prices };
      cache.set(key, { at: Date.now(), data });
      return data;
    },
  );
}
