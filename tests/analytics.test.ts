import { describe, expect, it } from "vitest";

import { analyze, projectRsu, targetGaps } from "@/lib/analytics";
import { COMFORT_CEILING, DEFAULT_TARGETS, TDF_SPLIT } from "@/lib/constants";
import { SEED_HOLDINGS } from "@/lib/seed";
import type { Holding } from "@/lib/types";

const a = analyze(SEED_HOLDINGS);

describe("analyze() — the known totals from the prototype", () => {
  it("totals ≈ $93,183", () => {
    expect(a.total).toBeCloseTo(93_183.51, 2);
    expect(Math.round(a.total)).toBe(93_184); // $93,183.51 rounds to 93,184
  });

  it("TSLA single-stock concentration ≈ 32.2%", () => {
    expect(a.tsla).not.toBeNull();
    expect(a.tsla!.value).toBe(30_000);
    expect(a.tsla!.pct).toBeCloseTo(32.2, 1);
  });

  it("high-level mix ≈ US 91.8% / Intl 5.9% / Bonds 1.3%", () => {
    expect(a.usEquityPct).toBeCloseTo(91.8, 1);
    expect(a.intlPct).toBeCloseTo(5.9, 1);
    expect(a.bondPct).toBeCloseTo(1.3, 1);
  });
});

describe("analyze() — internal consistency", () => {
  it("buckets are ordered [US equity, International, Bonds, Cash] and sum to the total", () => {
    expect(a.buckets.map((b) => b.label)).toEqual(["US equity", "International", "Bonds", "Cash"]);
    const sum = a.buckets.reduce((s, b) => s + b.value, 0);
    expect(sum).toBeCloseTo(a.total, 6);
  });

  it("bucket percentages sum to 100", () => {
    const sumPct = a.buckets.reduce((s, b) => s + b.pct, 0);
    expect(sumPct).toBeCloseTo(100, 6);
  });

  it("by-class values sum to the total", () => {
    const sum = a.byClass.reduce((s, c) => s + c.value, 0);
    expect(sum).toBeCloseTo(a.total, 6);
  });

  it("by-account values sum to the total", () => {
    const sum = a.byAccount.reduce((s, x) => s + x.value, 0);
    expect(sum).toBeCloseTo(a.total, 6);
    expect(a.byAccount).toHaveLength(5);
  });

  it("named bucket fields agree with the buckets array", () => {
    expect(a.usEquity).toBeCloseTo(a.buckets[0]!.value, 6);
    expect(a.intl).toBeCloseTo(a.buckets[1]!.value, 6);
    expect(a.bond).toBeCloseTo(a.buckets[2]!.value, 6);
    expect(a.cash).toBeCloseTo(a.buckets[3]!.value, 6);
    expect(a.cashTotal).toBeCloseTo(a.cash, 6);
  });

  it("cash totals the three cash positions ($212.08 + $320.38 + $332.91)", () => {
    expect(a.cashTotal).toBeCloseTo(865.37, 2);
  });

  it("aggregates duplicate symbols across accounts (SWPPX appears in two accounts)", () => {
    const swppx = a.symbols.find((s) => s.symbol === "SWPPX");
    expect(swppx).toBeDefined();
    expect(swppx!.value).toBeCloseTo(6626.64 + 6693.79, 2);
    expect(swppx!.costBasis).toBeCloseTo(3687.92 + 3829.23, 2);
  });

  it("unrealized profit = investedValue − invested, with a positive ROI", () => {
    expect(a.unrealized).toBeCloseTo(a.investedValue - a.invested, 6);
    expect(a.roi).toBeCloseTo((a.unrealized / a.invested) * 100, 6);
    expect(a.unrealized).toBeGreaterThan(0);
  });

  it("speculative satellites (ARKK ×2, SPCX, DHC) total ≈ $859.65", () => {
    // 79.60 + 159.20 + 577.50 + 43.35
    expect(a.specTotal).toBeCloseTo(859.65, 2);
  });

  it("singles are sorted by value with TSLA on top", () => {
    expect(a.singles[0]!.symbol).toBe("TSLA");
    for (let i = 1; i < a.singles.length; i++) {
      expect(a.singles[i - 1]!.value).toBeGreaterThanOrEqual(a.singles[i]!.value);
    }
  });
});

describe("target-date fund decomposition", () => {
  it("splits a lone TDF holding into 63 / 30 / 7", () => {
    const tdfOnly: Holding[] = [
      { id: "z", account: "x", symbol: "TDF", name: "Target 2060", value: 1000, costBasis: 1000, assetClass: "tdf" },
    ];
    const r = analyze(tdfOnly);
    expect(r.usEquity).toBeCloseTo(1000 * TDF_SPLIT.us, 6);
    expect(r.intl).toBeCloseTo(1000 * TDF_SPLIT.intl, 6);
    expect(r.bond).toBeCloseTo(1000 * TDF_SPLIT.bond, 6);
    expect(r.cash).toBe(0);
  });

  it("bonds in the real portfolio come entirely from the 2060 fund", () => {
    expect(a.bond).toBeCloseTo(17742.81 * TDF_SPLIT.bond, 2);
  });
});

describe("edge cases", () => {
  it("handles an empty portfolio without dividing by zero", () => {
    const r = analyze([]);
    expect(r.total).toBe(0);
    expect(r.tsla).toBeNull();
    expect(r.usEquityPct).toBe(0);
    expect(r.roi).toBe(0);
    expect(r.byClass).toEqual([]);
    expect(Number.isNaN(r.intlPct)).toBe(false);
  });

  it("coerces non-finite values to 0", () => {
    const messy: Holding[] = [
      { id: "1", account: "a", symbol: "A", name: "", value: Number.NaN, costBasis: 100, assetClass: "us_large" },
      { id: "2", account: "a", symbol: "B", name: "", value: 50, costBasis: 25, assetClass: "us_large" },
    ];
    const r = analyze(messy);
    expect(r.total).toBe(50);
  });
});

describe("targetGaps()", () => {
  const gaps = targetGaps(a.buckets, DEFAULT_TARGETS, a.total);

  it("returns a gap per bucket with correct dollar deltas", () => {
    expect(gaps).toHaveLength(4);
    const intlGap = gaps.find((g) => g.label === "International")!;
    // International is ~5.9% vs a 28% target → should say "add".
    expect(intlGap.deltaDollar).toBeGreaterThan(0);
    expect(intlGap.deltaDollar).toBeCloseTo(((28 - a.intlPct) / 100) * a.total, 6);
  });

  it("flags US equity as over target (a trim)", () => {
    const us = gaps.find((g) => g.label === "US equity")!;
    expect(us.deltaDollar).toBeLessThan(0); // 91.8% vs 60% target
  });
});

describe("projectRsu()", () => {
  it("brings TSLA below the ceiling within four years at the prototype defaults", () => {
    const p = projectRsu({
      startTslaValue: a.tsla!.value,
      startTotal: a.total,
      trimPerQuarter: 1500,
      vestPerQuarter: 3000,
      sellVests: true,
      ceilingPct: COMFORT_CEILING,
    });
    expect(p.points).toHaveLength(17); // q0..q16
    expect(p.points[0]!.pct).toBeCloseTo(a.tsla!.pct, 6);
    expect(p.reachedQuarter).not.toBeNull();
    expect(p.reachedQuarter!).toBeLessThanOrEqual(16);
    // Selling vests redirects trim + vest each quarter.
    expect(p.redirectPerQuarter).toBe(4500);
    // Concentration is monotonically falling under these inputs.
    for (let i = 1; i < p.points.length; i++) {
      expect(p.points[i]!.pct).toBeLessThanOrEqual(p.points[i - 1]!.pct + 1e-9);
    }
  });

  it("redirects only the trim when holding vests", () => {
    const p = projectRsu({
      startTslaValue: 30000,
      startTotal: 93183.51,
      trimPerQuarter: 1500,
      vestPerQuarter: 3000,
      sellVests: false,
      ceilingPct: 15,
    });
    expect(p.redirectPerQuarter).toBe(1500);
  });

  it("never lets TSLA value go negative", () => {
    const p = projectRsu({
      startTslaValue: 1000,
      startTotal: 5000,
      trimPerQuarter: 100000,
      vestPerQuarter: 0,
      sellVests: true,
      ceilingPct: 15,
    });
    expect(p.points.every((pt) => pt.tslaValue >= 0)).toBe(true);
  });
});

describe("analyze() — unvested equity compensation", () => {
  const vested = (unvested: number | null): Holding[] => [
    { id: "r", account: "Tesla · RSUs", symbol: "TSLA", name: "Tesla RSUs", value: 8_646.5, costBasis: 8_646.5, assetClass: "us_stock", unvested },
    { id: "s", account: "Schwab", symbol: "SWPPX", name: "S&P 500", value: 6_694.02, costBasis: 4_101.55, assetClass: "us_large" },
  ];

  it("excludes unvested value from the portfolio total", () => {
    const withUnvested = analyze(vested(19_557.85));
    const without = analyze(vested(null));
    // The total must be identical: unvested is tracked, never counted.
    expect(withUnvested.total).toBeCloseTo(without.total, 10);
    expect(withUnvested.total).toBeCloseTo(15_340.52, 2);
  });

  it("excludes unvested from every allocation percentage", () => {
    const a = analyze(vested(19_557.85));
    const sum = a.buckets.reduce((s, b) => s + b.pct, 0);
    expect(sum).toBeCloseTo(100, 9);
    expect(a.tsla?.pct).toBeCloseTo((8_646.5 / 15_340.52) * 100, 8);
  });

  it("reports unvested separately", () => {
    const a = analyze(vested(19_557.85));
    expect(a.unvestedTotal).toBeCloseTo(19_557.85, 10);
    expect(a.tslaUnvested).toBeCloseTo(19_557.85, 10);
  });

  it("computes exposure including unvested against the enlarged base", () => {
    const a = analyze(vested(19_557.85));
    // (8646.50 + 19557.85) / (15340.52 + 19557.85) = 28204.35 / 34898.37
    expect(a.tslaExposurePct).toBeCloseTo((28_204.35 / 34_898.37) * 100, 8);
    // Exposure must exceed the held-only percentage.
    expect(a.tslaExposurePct).toBeGreaterThan(a.tsla!.pct);
  });

  it("is a no-op when nothing is unvested", () => {
    const a = analyze(vested(null));
    expect(a.unvestedTotal).toBe(0);
    expect(a.tslaUnvested).toBe(0);
    // With no unvested value, exposure collapses to the held percentage.
    expect(a.tslaExposurePct).toBeCloseTo(a.tsla!.pct, 10);
  });

  it("coerces a non-finite unvested value to zero", () => {
    const a = analyze(vested(Number.NaN as unknown as number));
    expect(a.unvestedTotal).toBe(0);
    expect(Number.isFinite(a.tslaExposurePct)).toBe(true);
  });
});
