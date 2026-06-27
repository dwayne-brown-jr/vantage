import { describe, expect, it } from "vitest";

import type { Candle } from "@/lib/datasource";
import { computeTechnicals, rsi, sma } from "@/lib/technicals";

const candle = (close: number, high = close + 1, low = close - 1): Candle => ({
  time: 0,
  open: close,
  high,
  low,
  close,
  volume: 1000,
});

describe("sma()", () => {
  it("averages the last N closes", () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
    expect(sma([2, 4, 6], 2)).toBe(5);
  });
  it("returns null when there isn't enough data", () => {
    expect(sma([1, 2], 5)).toBeNull();
  });
});

describe("rsi()", () => {
  it("is 100 for a monotonic rise", () => {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(rsi(closes, 14)).toBe(100);
  });
  it("sits near 50 for an alternating series", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + (i % 2));
    const r = rsi(closes, 14)!;
    expect(r).toBeGreaterThan(40);
    expect(r).toBeLessThan(60);
  });
});

describe("computeTechnicals()", () => {
  it("derives a buy zone from the recent swing's Fibonacci retracement", () => {
    // Rise from 100 to 200 over 60 bars → swingLow 99, swingHigh 201 (±1 wick).
    const candles = Array.from({ length: 60 }, (_, i) => candle(100 + i * (100 / 59)));
    const t = computeTechnicals(candles)!;
    expect(t.swingHigh).toBeGreaterThan(t.swingLow);
    // buy zone is [61.8% retr, 38.2% retr] and sits inside the swing.
    expect(t.buyZone[0]).toBeLessThan(t.buyZone[1]);
    expect(t.buyZone[0]).toBeGreaterThanOrEqual(t.swingLow);
    expect(t.buyZone[1]).toBeLessThanOrEqual(t.swingHigh);
    // 50% retracement is the midpoint of the swing.
    expect(t.fib.f500).toBeCloseTo((t.swingHigh + t.swingLow) / 2, 6);
  });

  it("returns null SMA200 when the series is short, but a valid SMA50", () => {
    const candles = Array.from({ length: 60 }, () => candle(100));
    const t = computeTechnicals(candles)!;
    expect(t.sma50).toBeCloseTo(100, 6);
    expect(t.sma200).toBeNull();
  });

  it("returns null for too few candles", () => {
    expect(computeTechnicals([candle(100)])).toBeNull();
  });
});
