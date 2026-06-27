import type { Candle } from "@/lib/datasource";

/**
 * Deterministic technical levels for a price series. THIS is where the chart's
 * "buy zone" comes from — the AI only narrates over these computed numbers, it
 * never invents price targets. Educational, not investment advice.
 */
export interface Technicals {
  last: number;
  changePct: number;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  rangeHigh: number;
  rangeLow: number;
  /** Most recent swing high/low (over the trailing window) used for retracement. */
  swingHigh: number;
  swingLow: number;
  /** Fibonacci retracement levels of the recent swing (support on a pullback). */
  fib: { f236: number; f382: number; f500: number; f618: number };
  /** Suggested accumulation band [low, high] — the 38.2%–61.8% pullback zone. */
  buyZone: [number, number];
}

const avg = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Simple moving average of the last `period` closes, or null if insufficient. */
export function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  return avg(closes.slice(closes.length - period));
}

/** Classic 14-period RSI at the latest bar, or null if insufficient. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gains += d;
    else losses -= d;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function computeTechnicals(candles: Candle[]): Technicals | null {
  if (candles.length < 2) return null;
  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1]!;
  const prev = closes[closes.length - 2]!;

  const rangeHigh = Math.max(...candles.map((c) => c.high));
  const rangeLow = Math.min(...candles.map((c) => c.low));

  // Recent swing over the trailing ~60 bars (or all, if shorter).
  const window = candles.slice(Math.max(0, candles.length - 60));
  const swingHigh = Math.max(...window.map((c) => c.high));
  const swingLow = Math.min(...window.map((c) => c.low));
  const span = swingHigh - swingLow;
  const retr = (pct: number) => swingHigh - pct * span;
  const fib = { f236: retr(0.236), f382: retr(0.382), f500: retr(0.5), f618: retr(0.618) };

  return {
    last,
    changePct: prev > 0 ? ((last - prev) / prev) * 100 : 0,
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    rsi14: rsi(closes, 14),
    rangeHigh,
    rangeLow,
    swingHigh,
    swingLow,
    fib,
    buyZone: [fib.f618, fib.f382],
  };
}
