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

/* ── dividends (for portfolio yield) ─────────────────────────────────────── */
export interface DividendRate {
  symbol: string;
  /** Sum of dividends per share paid over the trailing 12 months. */
  trailingPerShare: number;
  /** How many distributions made up that total — 0 means it pays nothing. */
  payments: number;
  /** ISO date of the most recent distribution, if any. */
  lastPaid: string | null;
}

/**
 * Parse dividend events out of a Yahoo chart response into a trailing-12-month
 * per-share rate.
 *
 * Trailing rather than forward: it is what was actually paid, not a projection.
 * A fund that just cut its distribution will read high for up to a year, which
 * is the honest failure mode — it overstates nothing that did not happen.
 *
 * `asOfSeconds` bounds the window explicitly so the function stays pure and
 * testable; callers pass the current time.
 */
export function parseYahooDividends(json: unknown, symbol: string, asOfSeconds: number): DividendRate {
  const events = (
    json as { chart?: { result?: Array<{ events?: { dividends?: Record<string, { amount?: number; date?: number }> } }> } }
  )?.chart?.result?.[0]?.events?.dividends;

  const empty: DividendRate = { symbol: symbol.toUpperCase(), trailingPerShare: 0, payments: 0, lastPaid: null };
  if (!events || typeof events !== "object") return empty;

  const cutoff = asOfSeconds - 365 * 86_400;
  let total = 0;
  let payments = 0;
  let last = 0;

  for (const ev of Object.values(events)) {
    const amount = ev?.amount;
    const date = ev?.date;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) continue;
    if (typeof date !== "number" || !Number.isFinite(date)) continue;
    if (date < cutoff || date > asOfSeconds) continue;
    total += amount;
    payments += 1;
    if (date > last) last = date;
  }

  return {
    symbol: symbol.toUpperCase(),
    trailingPerShare: total,
    payments,
    lastPaid: last > 0 ? new Date(last * 1000).toISOString() : null,
  };
}

async function fetchYahooDividend(symbol: string, asOfSeconds: number): Promise<DividendRate | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y&events=div`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return parseYahooDividends(await res.json(), symbol, asOfSeconds);
  } catch {
    return null;
  }
}

/**
 * Trailing-12-month dividend rates for the given symbols. A symbol that cannot
 * be resolved is omitted entirely rather than reported as zero — "we don't
 * know" and "it pays nothing" are different, and conflating them would
 * silently understate the portfolio's yield.
 */
export async function fetchDividendRates(symbols: string[], asOfSeconds?: number): Promise<DividendRate[]> {
  const at = asOfSeconds ?? Math.floor(Date.now() / 1000);
  const results = await Promise.all(symbols.map((s) => fetchYahooDividend(s, at)));
  return results.filter((d): d is DividendRate => d !== null);
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
