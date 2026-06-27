/**
 * Live price feed — the seam the original stub reserved. Quotes come from
 * Yahoo Finance's public chart endpoint (no API key). It covers US stocks,
 * ETFs, and mutual funds; institutional/collective 401k funds (no public
 * ticker) won't resolve and stay manual.
 *
 * Only ticker symbols are sent out — never holdings, values, or account info.
 * The adapter is swappable (e.g. a keyed provider) via getDataSource().
 */
export interface PriceQuote {
  symbol: string;
  /** Per-share price in USD. */
  price: number;
  currency?: string;
  /** ISO timestamp the quote reflects. */
  asOf: string;
  name?: string;
}

export interface DataSourceAdapter {
  readonly id: string;
  readonly label: string;
  fetchQuotes(symbols: string[]): Promise<PriceQuote[]>;
}

/** Parse one Yahoo chart response into a quote (pure — unit tested). */
export function parseYahooQuote(json: unknown, fallbackSymbol: string): PriceQuote | null {
  const meta = (json as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } })?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  if (!meta || typeof price !== "number" || !Number.isFinite(price)) return null;
  const t = meta.regularMarketTime;
  const asOf = typeof t === "number" ? new Date(t * 1000).toISOString() : new Date().toISOString();
  return {
    symbol: String(meta.symbol ?? fallbackSymbol).toUpperCase(),
    price,
    currency: typeof meta.currency === "string" ? meta.currency : undefined,
    asOf,
    name: typeof meta.shortName === "string" ? meta.shortName : undefined,
  };
}

async function fetchYahooQuote(symbol: string): Promise<PriceQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return parseYahooQuote(await res.json(), symbol);
  } catch {
    return null;
  }
}

export const yahooDataSource: DataSourceAdapter = {
  id: "yahoo",
  label: "Yahoo Finance",
  async fetchQuotes(symbols) {
    const results = await Promise.all(symbols.map(fetchYahooQuote));
    return results.filter((q): q is PriceQuote => q !== null);
  },
};

export function getDataSource(): DataSourceAdapter {
  return yahooDataSource;
}

/* ── historical candles (for charting) ───────────────────────────────────── */
export interface Candle {
  /** Epoch seconds (lightweight-charts UTCTimestamp). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Parse a Yahoo chart response into clean candles (drops incomplete bars). */
export function parseYahooHistory(json: unknown): Candle[] {
  const result = (
    json as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<Record<string, Array<number | null>>> } }> } }
  )?.chart?.result?.[0];
  const ts = result?.timestamp;
  const q = result?.indicators?.quote?.[0];
  if (!Array.isArray(ts) || !q) return [];

  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    const v = q.volume?.[i];
    const ok = [o, h, l, c].every((x) => typeof x === "number" && Number.isFinite(x));
    if (ok) candles.push({ time: ts[i]!, open: o!, high: h!, low: l!, close: c!, volume: typeof v === "number" ? v : 0 });
  }
  return candles;
}

/** Fetch daily candles for a symbol. `range` like "6mo" | "1y" | "2y". */
export async function fetchHistory(symbol: string, range = "1y"): Promise<Candle[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${encodeURIComponent(range)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) return [];
    return parseYahooHistory(await res.json());
  } catch {
    return [];
  }
}
