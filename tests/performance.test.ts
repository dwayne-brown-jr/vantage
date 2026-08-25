/**
 * Deterministic validation of the performance math.
 *
 * Every expected value here is derived independently of the implementation —
 * from a closed form chosen so the answer is exact (1.1^3 = 1.331, so a
 * 1000 → 1331 run over 3 years is exactly 10%), or worked out by hand and
 * written as a literal. No expectation is copied from program output, which
 * would only assert that the code still does what it did.
 */
import { describe, expect, it } from "vitest";

import {
  cagr,
  cagrBetween,
  dividendYield,
  fromCents,
  portfolioYield,
  roundMoney,
  simpleReturn,
  sumMoney,
  toCents,
  totalReturn,
  yearsBetween,
  yieldOnCost,
} from "@/lib/performance";

/* ── CAGR ────────────────────────────────────────────────────────────────── */

describe("cagr() — exact closed forms", () => {
  it("1000 → 1331 over 3 years is exactly 10% (1.1^3 = 1.331)", () => {
    expect(cagr(1000, 1331, 3)).toBeCloseTo(10, 10);
  });

  it("10000 → 14641 over 4 years is exactly 10% (1.1^4 = 1.4641)", () => {
    expect(cagr(10_000, 14_641, 4)).toBeCloseTo(10, 10);
  });

  it("10000 → 16105.10 over 5 years is exactly 10% (1.1^5 = 1.61051)", () => {
    expect(cagr(10_000, 16_105.1, 5)).toBeCloseTo(10, 9);
  });

  it("doubling over 1 year is exactly 100%", () => {
    expect(cagr(50_000, 100_000, 1)).toBeCloseTo(100, 12);
  });

  it("halving over 1 year is exactly −50%", () => {
    expect(cagr(50_000, 25_000, 1)).toBeCloseTo(-50, 12);
  });

  it("doubling over 10 years is 2^0.1 − 1 = 7.177346253629313%", () => {
    // Independent value: 2**(1/10) = 1.0717734625362931
    expect(cagr(10_000, 20_000, 10)).toBeCloseTo(7.177346253629313, 10);
  });

  it("no change is exactly 0% over any span", () => {
    expect(cagr(93_183, 93_183, 7.5)).toBeCloseTo(0, 12);
  });

  it("a total loss is −100%, not null", () => {
    expect(cagr(10_000, 0, 3)).toBe(-100);
  });

  it("is the inverse of compounding: applying the rate reproduces the end value", () => {
    const start = 93_183.42;
    const end = 147_902.11;
    const years = 6.25;
    const rate = cagr(start, end, years);
    expect(rate).not.toBeNull();
    const reconstructed = start * Math.pow(1 + (rate as number) / 100, years);
    // Round-trip must agree to the penny.
    expect(roundMoney(reconstructed)).toBe(roundMoney(end));
  });

  it("is monotonic in the end value", () => {
    const a = cagr(10_000, 12_000, 5) as number;
    const b = cagr(10_000, 13_000, 5) as number;
    const c = cagr(10_000, 14_000, 5) as number;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it("returns null where the maths is undefined rather than NaN or Infinity", () => {
    expect(cagr(0, 10_000, 5)).toBeNull(); // no base to grow from
    expect(cagr(-100, 10_000, 5)).toBeNull(); // negative base
    expect(cagr(10_000, 20_000, 0)).toBeNull(); // zero span
    expect(cagr(10_000, 20_000, -3)).toBeNull(); // reversed span
    expect(cagr(10_000, -5_000, 5)).toBeNull(); // impossible end value
    expect(cagr(Number.NaN, 1, 1)).toBeNull();
    expect(cagr(1, Number.POSITIVE_INFINITY, 1)).toBeNull();
  });

  it("never returns NaN for any guarded input", () => {
    const inputs: [number, number, number][] = [
      [0, 0, 0],
      [-1, -1, -1],
      [1e-9, 1e12, 0.001],
      [Number.MIN_VALUE, Number.MAX_VALUE, 1],
    ];
    for (const [s, e, y] of inputs) {
      const r = cagr(s, e, y);
      expect(r === null || Number.isFinite(r)).toBe(true);
    }
  });
});

describe("yearsBetween() / cagrBetween()", () => {
  it("counts a 365-day span as 365/365.25 years", () => {
    const y = yearsBetween("2024-01-01T00:00:00Z", "2024-12-31T00:00:00Z");
    expect(y).toBeCloseTo(365 / 365.25, 12);
  });

  it("counts a full leap year (366 days) as 366/365.25 years", () => {
    const y = yearsBetween("2024-01-01T00:00:00Z", "2025-01-01T00:00:00Z");
    expect(y).toBeCloseTo(366 / 365.25, 12);
  });

  it("is exactly zero for the same instant and negative when reversed", () => {
    expect(yearsBetween("2026-08-24T00:00:00Z", "2026-08-24T00:00:00Z")).toBe(0);
    expect(yearsBetween("2026-08-24T00:00:00Z", "2025-08-24T00:00:00Z")).toBeLessThan(0);
  });

  it("returns null on an unparseable date instead of NaN", () => {
    expect(yearsBetween("not-a-date", "2026-01-01T00:00:00Z")).toBeNull();
    expect(cagrBetween({ date: "oops", value: 100 }, { date: "2026-01-01T00:00:00Z", value: 200 })).toBeNull();
  });

  it("refuses a non-advancing span rather than dividing by zero", () => {
    const same = { date: "2026-01-01T00:00:00Z", value: 100 };
    expect(cagrBetween(same, { ...same, value: 200 })).toBeNull();
  });

  it("computes a four-year doubling from dates", () => {
    // 2020-01-01 → 2024-01-01 is 1461 days = 1461/365.25 = exactly 4.0 years.
    const r = cagrBetween(
      { date: "2020-01-01T00:00:00Z", value: 10_000 },
      { date: "2024-01-01T00:00:00Z", value: 14_641 },
    );
    expect(r).toBeCloseTo(10, 10);
  });
});

/* ── total return ────────────────────────────────────────────────────────── */

describe("totalReturn()", () => {
  it("computes a plain gain with no flows", () => {
    const r = totalReturn({ startValue: 75_239, endValue: 93_183 });
    expect(r.gain).toBe(17_944);
    expect(r.basis).toBe(75_239);
    // 17944 / 75239 = 0.238493334573824747 → 23.8493334573824747%
    expect(r.pct).toBeCloseTo(23.8493334573824747, 10);
  });

  it("does not count a contribution as a gain", () => {
    // Deposited 10,000; ended exactly 10,000 higher. That is 0% return.
    const r = totalReturn({ startValue: 50_000, endValue: 60_000, contributions: 10_000 });
    expect(r.gain).toBe(0);
    expect(r.pct).toBe(0);
    expect(r.basis).toBe(60_000);
  });

  it("does not count a withdrawal as a loss", () => {
    const r = totalReturn({ startValue: 50_000, endValue: 40_000, withdrawals: 10_000 });
    expect(r.gain).toBe(0);
    expect(r.pct).toBe(0);
  });

  it("separates income from price movement", () => {
    const r = totalReturn({ startValue: 100_000, endValue: 105_000, income: 2_000 });
    expect(r.gain).toBe(7_000);
    expect(r.incomeGain).toBe(2_000);
    expect(r.priceGain).toBe(5_000);
    expect(r.pct).toBeCloseTo(7, 12);
  });

  it("handles a loss with income partially offsetting it", () => {
    const r = totalReturn({ startValue: 100_000, endValue: 94_000, income: 2_500 });
    expect(r.gain).toBe(-3_500);
    expect(r.priceGain).toBe(-6_000);
    expect(r.pct).toBeCloseTo(-3.5, 12);
  });

  it("combines every flow in one period", () => {
    // 80,000 start; +12,000 in; −5,000 out; 1,250 income; ends at 91,000.
    // gain = 91,000 + 5,000 + 1,250 − 80,000 − 12,000 = 5,250
    // basis = 92,000 → 5.706521739...%
    const r = totalReturn({
      startValue: 80_000,
      endValue: 91_000,
      contributions: 12_000,
      withdrawals: 5_000,
      income: 1_250,
    });
    expect(r.gain).toBe(5_250);
    expect(r.basis).toBe(92_000);
    expect(r.pct).toBeCloseTo(5.706521739130435, 10);
  });

  it("returns a null percentage rather than dividing by a zero basis", () => {
    const r = totalReturn({ startValue: 0, endValue: 5_000 });
    expect(r.pct).toBeNull();
    expect(r.gain).toBe(5_000);
  });

  it("coerces non-finite inputs to zero instead of propagating NaN", () => {
    const r = totalReturn({
      startValue: 1_000,
      endValue: Number.NaN,
      contributions: Number.POSITIVE_INFINITY,
    });
    expect(Number.isFinite(r.gain)).toBe(true);
    expect(r.gain).toBe(-1_000);
  });
});

describe("simpleReturn()", () => {
  it("matches hand arithmetic", () => {
    expect(simpleReturn(100, 125)).toBeCloseTo(25, 12);
    expect(simpleReturn(200, 150)).toBeCloseTo(-25, 12);
    expect(simpleReturn(93_183, 93_183)).toBe(0);
  });

  it("agrees with totalReturn when there are no flows", () => {
    const a = simpleReturn(75_239, 93_183);
    const b = totalReturn({ startValue: 75_239, endValue: 93_183 }).pct;
    expect(a).toBeCloseTo(b as number, 12);
  });

  it("returns null on a zero or negative start", () => {
    expect(simpleReturn(0, 100)).toBeNull();
    expect(simpleReturn(-10, 100)).toBeNull();
  });
});

/* ── yield ───────────────────────────────────────────────────────────────── */

describe("dividendYield() / yieldOnCost()", () => {
  it("computes a clean 3% yield", () => {
    expect(dividendYield(300, 10_000)).toBeCloseTo(3, 12);
  });

  it("matches a hand-checked SCHD-style position", () => {
    // 196.44 of SCHD paying 7.02 a year → 7.02 / 196.44 = 3.573610...%
    expect(dividendYield(7.02, 196.44)).toBeCloseTo(3.5736102626755243, 10);
  });

  it("yield on cost exceeds current yield for an appreciated position", () => {
    // Paid 1,000, now worth 2,000, pays 60 a year.
    expect(dividendYield(60, 2_000)).toBeCloseTo(3, 12);
    expect(yieldOnCost(60, 1_000)).toBeCloseTo(6, 12);
  });

  it("is zero — not null — for a real position paying nothing", () => {
    expect(dividendYield(0, 30_000)).toBe(0);
  });

  it("returns null rather than dividing by zero value or basis", () => {
    expect(dividendYield(100, 0)).toBeNull();
    expect(dividendYield(100, -5)).toBeNull();
    expect(yieldOnCost(100, 0)).toBeNull();
  });
});

describe("portfolioYield()", () => {
  const positions = [
    { symbol: "SCHD", marketValue: 196.44, annualIncome: 7.02 },
    { symbol: "SWPPX", marketValue: 6_694.02, annualIncome: 80.33 },
    { symbol: "TSLA", marketValue: 30_000.0, annualIncome: 0 },
  ];

  it("weights by value, not by position count", () => {
    const r = portfolioYield(positions);
    expect(r.totalIncome).toBe(87.35); // 7.02 + 80.33, exact to the cent
    expect(r.totalValue).toBe(36_890.46); // 196.44 + 6694.02 + 30000
    // 87.35 / 36890.46 = 0.00236782084040155605 → 0.236782084040155605%
    // Dragged far below SCHD's own 3.57% by the non-paying TSLA position.
    expect(r.pct).toBeCloseTo(0.236782084040155605, 10);
  });

  it("is NOT the mean of the individual yields", () => {
    // Naive average would be (3.5736 + 1.2000 + 0) / 3 = 1.591%, nearly 7x
    // the true value-weighted figure. This asserts we did not make that error.
    const naive =
      positions.map((p) => dividendYield(p.annualIncome, p.marketValue) ?? 0).reduce((a, b) => a + b, 0) /
      positions.length;
    const weighted = portfolioYield(positions).pct as number;
    expect(naive).toBeGreaterThan(weighted * 5);
  });

  it("derives monthly income to the cent", () => {
    // 87.35 / 12 = 7.279166… → 7.28
    expect(portfolioYield(positions).monthlyIncome).toBe(7.28);
  });

  it("handles an empty portfolio without dividing by zero", () => {
    const r = portfolioYield([]);
    expect(r.totalIncome).toBe(0);
    expect(r.totalValue).toBe(0);
    expect(r.pct).toBeNull();
    expect(r.monthlyIncome).toBe(0);
  });
});
