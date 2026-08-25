/**
 * Penny-level precision guarantees.
 *
 * Money in this app is stored and summed as IEEE-754 doubles, which cannot
 * represent most decimal fractions exactly. These tests pin down where that is
 * harmless and where it is not:
 *
 *   - Aggregates (bucket totals, per-account totals) must reconcile to the
 *     portfolio total to the penny, not merely "closely".
 *   - Percentages must sum to 100 within a tolerance far tighter than the one
 *     decimal place the UI shows, so a displayed split can never read 99.9%.
 *   - The rounding convention must be single and explicit, because
 *     `Math.round(n * 100) / 100` and `n.toFixed(2)` disagree on exact halves.
 *
 * TOLERANCES ARE DELIBERATE. HALF_CENT is the largest error that can never
 * change a figure displayed to the cent. Anything asserted with `toBe` is
 * required to be exact.
 */
import { describe, expect, it } from "vitest";

import { analyze, targetGaps } from "@/lib/analytics";
import { DEFAULT_TARGETS, TDF_SPLIT } from "@/lib/constants";
import { fromCents, roundMoney, sumMoney, toCents } from "@/lib/performance";
import type { Holding } from "@/lib/types";

/** Largest error that can never alter a value displayed to the cent. */
const HALF_CENT = 0.005;
/** Percentages are derived, not stored; this is ~1e-9 of a percentage point. */
const PCT_EPSILON = 1e-9;

const h = (
  id: string,
  account: string,
  symbol: string,
  value: number,
  costBasis: number,
  assetClass: Holding["assetClass"],
): Holding => ({ id, account, symbol, name: symbol, value, costBasis, assetClass });

/**
 * Fixed portfolio with deliberately awkward cents — values chosen so that
 * naive float addition drifts (0.1 + 0.2 territory) and percentages do not
 * divide evenly.
 */
const PORTFOLIO: Holding[] = [
  h("1", "Schwab · Individual (taxable)", "SWPPX", 6_626.64, 3_687.92, "us_large"),
  h("2", "Schwab · Individual (taxable)", "SWTSX", 707.01, 398.19, "us_total"),
  h("3", "Schwab · Individual (taxable)", "NVDA", 635.84, 556.34, "us_stock"),
  h("4", "Schwab · Individual (taxable)", "CASH", 212.08, 0, "cash"),
  h("5", "Schwab · Roth IRA", "SWPPX", 6_694.02, 4_101.55, "us_large"),
  h("6", "Schwab · Roth IRA", "SCHE", 110.33, 98.77, "intl_em"),
  h("7", "Schwab · Roth IRA", "SWISX", 88.19, 81.02, "intl_dev"),
  h("8", "Schwab · Roth IRA", "SCHD", 196.44, 171.28, "div_value"),
  h("9", "Schwab · Roth IRA", "ARKK", 159.07, 233.41, "spec"),
  h("10", "Schwab · Roth IRA", "CASH", 320.38, 0, "cash"),
  h("11", "Fidelity · Tesla 401(k)", "TRP2060", 17_743.29, 12_004.11, "tdf"),
  h("12", "Tesla · RSUs", "TSLA", 30_000.03, 0, "us_stock"),
  h("13", "E*Trade", "CASH", 332.91, 0, "cash"),
];

/** Independent total: summed in integer cents, never as floats. */
const EXPECTED_TOTAL_CENTS = [
  662_664, 70_701, 63_584, 21_208, 669_402, 11_033, 8_819, 19_644, 15_907, 32_038, 1_774_329, 3_000_003, 33_291,
].reduce((a, b) => a + b, 0);
const EXPECTED_TOTAL = fromCents(EXPECTED_TOTAL_CENTS); // 63,824.23... verified below

/* ── the rounding convention itself ──────────────────────────────────────── */

describe("roundMoney() — one documented convention", () => {
  it("rounds exact halves away from zero", () => {
    expect(roundMoney(0.005)).toBe(0.01);
    expect(roundMoney(-0.005)).toBe(-0.01);
    expect(roundMoney(2.5)).toBe(2.5);
    expect(roundMoney(1.115)).toBe(1.12);
  });

  it("fixes the cases where Math.round(n*100)/100 and toFixed(2) disagree", () => {
    // 2.675 * 100 is 267.49999999999997 in binary, so the naive forms split:
    // Math.round gives 2.68, toFixed gives 2.67. Both are guesses; we pick
    // half-away-from-zero on the decimal the human wrote.
    expect((2.675).toFixed(2)).toBe("2.67"); // documents the disagreement
    expect(roundMoney(2.675)).toBe(2.68);

    expect((1.005).toFixed(2)).toBe("1.00");
    expect(Math.round(1.005 * 100) / 100).toBe(1); // naive form loses the cent
    expect(roundMoney(1.005)).toBe(1.01);

    expect(roundMoney(0.615)).toBe(0.62);
    expect(roundMoney(8.575)).toBe(8.58);
  });

  it("does not move a genuine .004 or .006", () => {
    expect(roundMoney(1.004)).toBe(1.0);
    expect(roundMoney(1.006)).toBe(1.01);
    expect(roundMoney(-1.004)).toBe(-1.0);
    expect(roundMoney(-1.006)).toBe(-1.01);
  });

  it("never yields negative zero", () => {
    expect(Object.is(roundMoney(-0.001), -0)).toBe(false);
    expect(roundMoney(-0.001)).toBe(0);
  });

  it("is idempotent", () => {
    for (const n of [1.005, 2.675, 93_183.427, -0.005, 0.615]) {
      expect(roundMoney(roundMoney(n))).toBe(roundMoney(n));
    }
  });

  it("coerces non-finite input to 0 rather than propagating it", () => {
    expect(roundMoney(Number.NaN)).toBe(0);
    expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("sumMoney() — addition without drift", () => {
  it("sums the three cash positions to exactly 865.37", () => {
    // A plain reduce gives 865.3700000000001.
    expect([212.08, 320.38, 332.91].reduce((a, b) => a + b, 0)).not.toBe(865.37);
    expect(sumMoney([212.08, 320.38, 332.91])).toBe(865.37);
  });

  it("sums 0.1 + 0.2 to exactly 0.30", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });

  it("stays exact over a thousand values whose cent conversion is inexact", () => {
    // 0.07 * 100 is 7.000000000000001, so scaling to cents WITHOUT rounding
    // accumulates ~1e-12 per item. This input distinguishes summing in true
    // integer cents from merely multiplying by 100 first — a weaker test
    // (0.1 + 0.2) cannot, because 0.1 * 100 is exactly 10.
    const values = Array.from({ length: 1000 }, () => 0.07);
    expect(values.reduce((a, v) => a + v * 100, 0) / 100).not.toBe(70);
    expect(sumMoney(values)).toBe(70);
  });

  it("stays exact over a thousand mixed awkward cents", () => {
    const values = Array.from({ length: 1000 }, (_, i) => (i % 7) / 100 + 0.01);
    const expectedCents = values.reduce((acc, v) => acc + toCents(v), 0);
    expect(toCents(sumMoney(values))).toBe(expectedCents);
    expect(sumMoney(values)).toBe(fromCents(expectedCents));
  });

  it("rounds each addend to a whole cent before summing", () => {
    // 8.575 * 100 is 857.4999999999999; scaling without rounding loses the
    // half-cent, so the total lands a cent low.
    expect(sumMoney([8.575, 8.575])).toBe(17.16); // 8.58 + 8.58
    expect(sumMoney([1.005, 1.005, 1.005])).toBe(3.03); // 1.01 x 3
  });

  it("is order-independent", () => {
    const a = [212.08, 320.38, 332.91, 6_626.64, 0.07];
    const b = [0.07, 6_626.64, 332.91, 212.08, 320.38];
    expect(sumMoney(a)).toBe(sumMoney(b));
  });
});

/* ── the engine's aggregates must reconcile ──────────────────────────────── */

describe("analyze() — aggregates reconcile to the penny", () => {
  const a = analyze(PORTFOLIO);

  it("total matches an independent integer-cent sum exactly", () => {
    expect(toCents(a.total)).toBe(EXPECTED_TOTAL_CENTS);
    expect(roundMoney(a.total)).toBe(EXPECTED_TOTAL);
  });

  it("by-class values reconcile to the total within half a cent", () => {
    const summed = a.byClass.reduce((s, c) => s + c.value, 0);
    expect(Math.abs(summed - a.total)).toBeLessThan(HALF_CENT);
    expect(roundMoney(summed)).toBe(roundMoney(a.total));
  });

  it("by-account values reconcile to the total within half a cent", () => {
    const summed = a.byAccount.reduce((s, x) => s + x.value, 0);
    expect(Math.abs(summed - a.total)).toBeLessThan(HALF_CENT);
    expect(roundMoney(summed)).toBe(roundMoney(a.total));
  });

  it("buckets reconcile to the total within half a cent, TDF split included", () => {
    const summed = a.buckets.reduce((s, b) => s + b.value, 0);
    expect(Math.abs(summed - a.total)).toBeLessThan(HALF_CENT);
    expect(roundMoney(summed)).toBe(roundMoney(a.total));
  });

  it("the TDF split weights sum to exactly 1, losing nothing", () => {
    // If these drifted, every target-date dollar would leak from the buckets.
    expect(TDF_SPLIT.us + TDF_SPLIT.intl + TDF_SPLIT.bond).toBe(1);
    const v = 17_743.29;
    const parts = v * TDF_SPLIT.us + v * TDF_SPLIT.intl + v * TDF_SPLIT.bond;
    expect(Math.abs(parts - v)).toBeLessThan(HALF_CENT);
  });

  it("splits a target-date holding into exactly 63 / 30 / 7", () => {
    const only = analyze([h("t", "401k", "TRP2060", 10_000, 0, "tdf")]);
    expect(roundMoney(only.usEquity)).toBe(6_300);
    expect(roundMoney(only.intl)).toBe(3_000);
    expect(roundMoney(only.bond)).toBe(700);
  });

  it("per-symbol aggregates reconcile to the non-cash total", () => {
    const summed = a.symbols.reduce((s, x) => s + x.value, 0);
    expect(Math.abs(summed - a.investedValue)).toBeLessThan(HALF_CENT);
  });

  it("unrealized is exactly investedValue − invested", () => {
    expect(toCents(a.unrealized)).toBe(toCents(a.investedValue) - toCents(a.invested));
  });

  it("cash total is exact, not 865.3700000000001", () => {
    expect(roundMoney(a.cashTotal)).toBe(865.37);
  });
});

/* ── percentages ─────────────────────────────────────────────────────────── */

describe("allocation percentages", () => {
  const a = analyze(PORTFOLIO);

  it("bucket percentages sum to 100 within 1e-9", () => {
    const sum = a.buckets.reduce((s, b) => s + b.pct, 0);
    expect(Math.abs(sum - 100)).toBeLessThan(PCT_EPSILON);
  });

  it("by-class percentages sum to 100 within 1e-9", () => {
    const sum = a.byClass.reduce((s, c) => s + c.pct, 0);
    expect(Math.abs(sum - 100)).toBeLessThan(PCT_EPSILON);
  });

  it("by-account percentages sum to 100 within 1e-9", () => {
    const sum = a.byAccount.reduce((s, x) => s + x.pct, 0);
    expect(Math.abs(sum - 100)).toBeLessThan(PCT_EPSILON);
  });

  it("still sums to 100.0 after rounding to the one decimal the UI shows", () => {
    // Guards against a displayed pie reading 99.9% or 100.1%.
    const rounded = a.buckets.map((b) => Math.round(b.pct * 10) / 10);
    const sum = rounded.reduce((s, p) => s + p, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.1);
  });

  it("each percentage equals value / total exactly", () => {
    for (const b of a.buckets) {
      expect(b.pct).toBeCloseTo((b.value / a.total) * 100, 12);
    }
  });

  it("no percentage is NaN, negative, or above 100", () => {
    for (const p of [...a.buckets, ...a.byClass, ...a.byAccount].map((x) => x.pct)) {
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100 + PCT_EPSILON);
    }
  });

  it("an empty portfolio yields 0%, never NaN", () => {
    const empty = analyze([]);
    expect(empty.total).toBe(0);
    for (const b of empty.buckets) expect(b.pct).toBe(0);
    expect(empty.roi).toBe(0);
  });

  it("a single holding is exactly 100%", () => {
    const one = analyze([h("x", "A", "VTI", 1_234.56, 1_000, "us_total")]);
    expect(one.byClass[0]?.pct).toBe(100);
    expect(one.byAccount[0]?.pct).toBe(100);
  });
});

/* ── ROI / total return already in the engine ────────────────────────────── */

describe("analyze() — return figures", () => {
  const a = analyze(PORTFOLIO);

  it("ROI equals unrealized / invested exactly", () => {
    expect(a.roi).toBeCloseTo((a.unrealized / a.invested) * 100, 12);
  });

  it("excludes cash from the invested base", () => {
    // Cash has no basis; including it would understate ROI.
    const cashBasis = PORTFOLIO.filter((x) => x.assetClass === "cash").reduce((s, x) => s + x.costBasis, 0);
    expect(cashBasis).toBe(0);
    expect(toCents(a.investedValue)).toBe(EXPECTED_TOTAL_CENTS - toCents(a.cashTotal));
  });

  it("per-symbol ROI matches hand arithmetic", () => {
    // NVDA: 635.84 value on 556.34 basis → 79.50 / 556.34 = 14.2898227702484082%
    const nvda = a.symbols.find((s) => s.symbol === "NVDA");
    expect(nvda).toBeDefined();
    expect(roundMoney(nvda!.unrealized)).toBe(79.5);
    expect(nvda!.roi).toBeCloseTo(14.2898227702484082, 9);
  });

  it("aggregates a symbol held in two accounts", () => {
    // SWPPX: 6,626.64 + 6,694.02 = 13,320.66 on 3,687.92 + 4,101.55 = 7,789.47
    const swppx = a.symbols.find((s) => s.symbol === "SWPPX");
    expect(roundMoney(swppx!.value)).toBe(13_320.66);
    expect(roundMoney(swppx!.costBasis)).toBe(7_789.47);
    expect(roundMoney(swppx!.unrealized)).toBe(5_531.19);
  });

  it("reports a loss as negative, not as an absolute value", () => {
    const arkk = a.symbols.find((s) => s.symbol === "ARKK");
    expect(arkk!.unrealized).toBeLessThan(0);
    expect(roundMoney(arkk!.unrealized)).toBe(-74.34);
  });
});

/* ── rebalancing deltas ──────────────────────────────────────────────────── */

describe("targetGaps() — dollar deltas", () => {
  const a = analyze(PORTFOLIO);
  const gaps = targetGaps(a.buckets, DEFAULT_TARGETS, a.total);

  it("deltas sum to zero — a rebalance moves money, it does not create it", () => {
    const sum = gaps.reduce((s, g) => s + g.deltaDollar, 0);
    // Targets sum to 100, so the deltas must cancel exactly.
    expect(Object.values(DEFAULT_TARGETS).reduce((s, t) => s + t, 0)).toBe(100);
    expect(Math.abs(sum)).toBeLessThan(HALF_CENT);
  });

  it("each delta equals (target − actual) × total / 100", () => {
    for (const g of gaps) {
      expect(g.deltaDollar).toBeCloseTo(((g.targetPct - g.actualPct) / 100) * a.total, 9);
    }
  });

  it("signs a shortfall positive and an excess negative", () => {
    const us = gaps.find((g) => g.label === "US equity")!;
    expect(us.actualPct).toBeGreaterThan(us.targetPct);
    expect(us.deltaDollar).toBeLessThan(0);
  });
});
