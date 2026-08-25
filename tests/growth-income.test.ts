import { describe, expect, it } from "vitest";

import { parseYahooDividends } from "@/lib/datasource";
import { MIN_DAYS_FOR_CAGR, MIN_DAYS_FOR_RETURN, portfolioGrowth } from "@/lib/growth";
import { buildIncome } from "@/lib/income";
import type { Snapshot } from "@/lib/snapshots";
import type { Holding } from "@/lib/types";

const snap = (day: string, total: number): Snapshot => ({
  id: day,
  at: `${day}T12:00:00.000Z`,
  day,
  total,
  tslaValue: 0,
  tslaPct: 0,
  usEquityPct: 0,
  intlPct: 0,
  bondPct: 0,
  cashPct: 0,
  invested: 0,
  unrealized: 0,
});

/* ── growth ──────────────────────────────────────────────────────────────── */

describe("portfolioGrowth() — refuses to annualize a short window", () => {
  it("reports nothing from a single snapshot", () => {
    const g = portfolioGrowth([snap("2026-08-25", 93_183)]);
    expect(g.status).toBe("insufficient");
    expect(g.cagrPct).toBeNull();
    expect(g.totalReturnPct).toBeNull();
  });

  it("reports nothing from an empty history", () => {
    expect(portfolioGrowth([]).status).toBe("insufficient");
  });

  it("does NOT annualize a three-day 2% move", () => {
    // Compounded out to a year this is roughly +770%. Reporting that as a
    // growth rate would be indefensible, so the status stays insufficient.
    const g = portfolioGrowth([snap("2026-08-22", 100_000), snap("2026-08-25", 102_000)]);
    expect(g.days).toBe(3);
    expect(g.status).toBe("insufficient");
    expect(g.cagrPct).toBeNull();
    expect(g.totalReturnPct).toBeNull();
    expect(g.daysUntilNext).toBe(MIN_DAYS_FOR_RETURN - 3);
  });

  it("gives a cumulative return once past the minimum, still not annualized", () => {
    const g = portfolioGrowth([snap("2026-01-01", 100_000), snap("2026-06-30", 110_000)]);
    expect(g.days).toBe(180);
    expect(g.status).toBe("cumulative");
    expect(g.totalReturnPct).toBeCloseTo(10, 10);
    expect(g.cagrPct).toBeNull();
    expect(g.daysUntilNext).toBe(MIN_DAYS_FOR_CAGR - 180);
  });

  it("annualizes only at a year or more", () => {
    // 2025-01-01 → 2026-01-01 is 365 days; 1.1x over ~1 year is ~10%.
    const g = portfolioGrowth([snap("2025-01-01", 100_000), snap("2026-01-01", 110_000)]);
    expect(g.days).toBe(365);
    expect(g.status).toBe("annualized");
    expect(g.totalReturnPct).toBeCloseTo(10, 10);
    // The span is 365/365.25 years, i.e. slightly under one, so annualizing
    // lifts it a shade above the simple 10%: 1.1^(365.25/365) − 1.
    expect(g.cagrPct).toBeCloseTo(10.0071811383510614, 8);
  });

  it("matches an exact four-year doubling", () => {
    // 2020-01-01 → 2024-01-01 is 1461 days = exactly 4.0 years at 365.25.
    const g = portfolioGrowth([snap("2020-01-01", 10_000), snap("2024-01-01", 14_641)]);
    expect(g.days).toBe(1461);
    expect(g.status).toBe("annualized");
    expect(g.cagrPct).toBeCloseTo(10, 9); // 1.1^4 = 1.4641
  });

  it("reports a decline as negative", () => {
    const g = portfolioGrowth([snap("2025-01-01", 100_000), snap("2026-01-01", 80_000)]);
    expect(g.totalReturnPct).toBeCloseTo(-20, 10);
    expect(g.cagrPct).toBeLessThan(0);
  });

  it("uses the outermost snapshots regardless of input order", () => {
    const g = portfolioGrowth([
      snap("2026-06-30", 110_000),
      snap("2026-01-01", 100_000),
      snap("2026-03-15", 104_000),
    ]);
    expect(g.startDay).toBe("2026-01-01");
    expect(g.endDay).toBe("2026-06-30");
    expect(g.totalReturnPct).toBeCloseTo(10, 10);
  });

  it("ignores zero and non-finite snapshots rather than dividing by them", () => {
    const g = portfolioGrowth([
      snap("2026-01-01", 0),
      snap("2026-01-02", Number.NaN),
      snap("2026-01-10", 100_000),
      snap("2026-07-10", 120_000),
    ]);
    expect(g.startDay).toBe("2026-01-10");
    expect(g.totalReturnPct).toBeCloseTo(20, 10);
  });

  it("never returns NaN in any field", () => {
    for (const snaps of [[], [snap("2026-01-01", 1)], [snap("2026-01-01", 1), snap("2026-01-01", 1)]]) {
      const g = portfolioGrowth(snaps);
      for (const v of [g.totalReturnPct, g.cagrPct, g.startValue, g.endValue]) {
        expect(v === null || Number.isFinite(v)).toBe(true);
      }
      expect(Number.isFinite(g.days)).toBe(true);
    }
  });
});

/* ── dividend parsing ────────────────────────────────────────────────────── */

describe("parseYahooDividends()", () => {
  const NOW = Math.floor(Date.parse("2026-08-25T00:00:00Z") / 1000);
  const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);

  const payload = (events: Array<{ amount: number; date: number }>) => ({
    chart: {
      result: [
        {
          events: {
            dividends: Object.fromEntries(events.map((e) => [String(e.date), e])),
          },
        },
      ],
    },
  });

  it("sums four quarterly payments into a trailing rate", () => {
    // The real SCHD schedule: 0.2600 + 0.2780 + 0.2570 + 0.2530 = 1.0480
    const json = payload([
      { amount: 0.26, date: at("2025-09-24T00:00:00Z") },
      { amount: 0.278, date: at("2025-12-10T00:00:00Z") },
      { amount: 0.257, date: at("2026-03-25T00:00:00Z") },
      { amount: 0.253, date: at("2026-06-24T00:00:00Z") },
    ]);
    const r = parseYahooDividends(json, "schd", NOW);
    expect(r.symbol).toBe("SCHD");
    expect(r.trailingPerShare).toBeCloseTo(1.048, 10);
    expect(r.payments).toBe(4);
    expect(r.lastPaid).toBe("2026-06-24T00:00:00.000Z");
  });

  it("excludes payments older than twelve months", () => {
    const json = payload([
      { amount: 5.0, date: at("2025-01-01T00:00:00Z") }, // >12mo before NOW
      { amount: 0.25, date: at("2026-06-24T00:00:00Z") },
    ]);
    const r = parseYahooDividends(json, "X", NOW);
    expect(r.trailingPerShare).toBeCloseTo(0.25, 10);
    expect(r.payments).toBe(1);
  });

  it("excludes future-dated events", () => {
    const json = payload([{ amount: 0.5, date: at("2026-12-01T00:00:00Z") }]);
    expect(parseYahooDividends(json, "X", NOW).payments).toBe(0);
  });

  it("reports a non-payer as zero with no payments", () => {
    const r = parseYahooDividends(payload([]), "TSLA", NOW);
    expect(r.trailingPerShare).toBe(0);
    expect(r.payments).toBe(0);
    expect(r.lastPaid).toBeNull();
  });

  it("survives a malformed or empty response", () => {
    for (const junk of [null, {}, { chart: {} }, { chart: { result: [] } }, { chart: { result: [{}] } }]) {
      const r = parseYahooDividends(junk, "X", NOW);
      expect(r.trailingPerShare).toBe(0);
      expect(r.payments).toBe(0);
    }
  });

  it("skips negative, zero, and non-numeric amounts", () => {
    const json = payload([
      { amount: -1, date: at("2026-06-01T00:00:00Z") },
      { amount: 0, date: at("2026-06-02T00:00:00Z") },
      { amount: 0.3, date: at("2026-06-03T00:00:00Z") },
    ]);
    const r = parseYahooDividends(json, "X", NOW);
    expect(r.trailingPerShare).toBeCloseTo(0.3, 10);
    expect(r.payments).toBe(1);
  });
});

/* ── income ──────────────────────────────────────────────────────────────── */

const h = (
  symbol: string,
  value: number,
  quantity: number | null,
  assetClass: Holding["assetClass"] = "us_large",
): Holding => ({
  id: symbol + value,
  account: "Roth",
  symbol,
  name: symbol,
  value,
  costBasis: 0,
  assetClass,
  quantity,
});

const rate = (symbol: string, trailingPerShare: number) => ({
  symbol,
  trailingPerShare,
  payments: 4,
  lastPaid: "2026-06-24T00:00:00.000Z",
});

describe("buildIncome()", () => {
  it("computes income as shares × trailing rate", () => {
    // 128.4404 shares of SCHB at 0.9812/share = 126.0257... → 126.03
    const r = buildIncome([h("SCHB", 3_791.35, 128.4404)], [rate("SCHB", 0.9812)]);
    expect(r.positions[0]?.annualIncome).toBe(126.03);
    expect(r.annualIncome).toBe(126.03);
    expect(r.monthlyIncome).toBe(10.5); // 126.03 / 12 = 10.5025 → 10.50
  });

  it("measures yield against the WHOLE portfolio, not just the payers", () => {
    // 100 in SCHD paying 3.00; 900 in a non-payer. True portfolio yield is
    // 3 / 1000 = 0.3%, not 3 / 100 = 3%.
    const r = buildIncome(
      [h("SCHD", 100, 10), h("TSLA", 900, 3, "us_stock")],
      [rate("SCHD", 0.3), rate("TSLA", 0)],
    );
    expect(r.annualIncome).toBe(3);
    expect(r.totalValue).toBe(1_000);
    expect(r.yieldPct).toBeCloseTo(0.3, 10);
  });

  it("counts cash in the denominator but never as a payer", () => {
    const r = buildIncome(
      [h("SCHD", 1_000, 100), h("CASH", 1_000, null, "cash")],
      [rate("SCHD", 1.0)],
    );
    expect(r.annualIncome).toBe(100);
    expect(r.totalValue).toBe(2_000);
    expect(r.yieldPct).toBeCloseTo(5, 10);
    // Cash is not a position we failed to resolve — it is excluded outright.
    expect(r.uncoveredSymbols).not.toContain("CASH");
  });

  it("distinguishes 'pays nothing' from 'we do not know'", () => {
    const r = buildIncome(
      [
        h("TSLA", 30_000, 86, "us_stock"), // known: pays nothing
        h("TRP2060", 17_743, null, "tdf"), // unknown: no share count, no rate
      ],
      [rate("TSLA", 0)],
    );
    expect(r.covered).toBe(1);
    expect(r.uncovered).toBe(1);
    expect(r.uncoveredSymbols).toEqual(["TRP2060"]);
    expect(r.complete).toBe(false);
    expect(r.positions.find((p) => p.symbol === "TSLA")?.annualIncome).toBe(0);
    expect(r.positions.find((p) => p.symbol === "TRP2060")?.annualIncome).toBeNull();
  });

  it("leaves income unknown when the share count is missing", () => {
    const r = buildIncome([h("SCHD", 1_000, null)], [rate("SCHD", 1.0)]);
    expect(r.positions[0]?.annualIncome).toBeNull();
    expect(r.annualIncome).toBe(0);
    expect(r.covered).toBe(0);
  });

  it("leaves income unknown when no rate was resolved", () => {
    const r = buildIncome([h("SCHD", 1_000, 100)], []);
    expect(r.positions[0]?.annualIncome).toBeNull();
    expect(r.covered).toBe(0);
    expect(r.uncoveredSymbols).toEqual(["SCHD"]);
  });

  it("reports coverage so a partial answer is never mistaken for a full one", () => {
    const r = buildIncome(
      [h("SCHD", 250, 25), h("TRP2060", 750, null, "tdf")],
      [rate("SCHD", 1.0)],
    );
    expect(r.coveredValue).toBe(250);
    expect(r.coveragePct).toBeCloseTo(25, 10);
    expect(r.complete).toBe(false);
  });

  it("yields a floor: an unresolved position can only push the true yield up", () => {
    const partial = buildIncome([h("SCHD", 500, 50), h("VYM", 500, null)], [rate("SCHD", 1.0)]);
    const full = buildIncome(
      [h("SCHD", 500, 50), h("VYM", 500, 50)],
      [rate("SCHD", 1.0), rate("VYM", 1.0)],
    );
    expect(partial.yieldPct as number).toBeLessThan(full.yieldPct as number);
  });

  it("handles an empty portfolio without dividing by zero", () => {
    const r = buildIncome([], []);
    expect(r.annualIncome).toBe(0);
    expect(r.yieldPct).toBeNull();
    expect(r.coveragePct).toBe(0);
    expect(r.complete).toBe(true);
  });

  it("sorts the largest income first", () => {
    const r = buildIncome(
      [h("A", 100, 10), h("B", 100, 10), h("C", 100, 10)],
      [rate("A", 0.1), rate("B", 0.9), rate("C", 0.5)],
    );
    expect(r.positions.map((p) => p.symbol)).toEqual(["B", "C", "A"]);
  });
});
