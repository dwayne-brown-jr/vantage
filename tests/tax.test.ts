import { describe, expect, it } from "vitest";

import { trimTax } from "@/lib/tax";

describe("trimTax()", () => {
  it("taxes only the gain portion at the combined rate", () => {
    const r = trimTax({ trimAmount: 10_000, gainPct: 50, capGainsRate: 18.8, stateRate: 0, taxAdvantaged: false });
    expect(r.realizedGain).toBe(5_000);
    expect(r.tax).toBeCloseTo(940, 2); // 5000 * 18.8%
    expect(r.net).toBeCloseTo(9_060, 2);
    expect(r.effectiveRate).toBeCloseTo(9.4, 2); // 940 / 10000
  });

  it("adds state tax on top of federal", () => {
    const r = trimTax({ trimAmount: 10_000, gainPct: 100, capGainsRate: 18.8, stateRate: 5, taxAdvantaged: false });
    expect(r.tax).toBeCloseTo(2_380, 2); // 10000 * (18.8 + 5)%
  });

  it("is tax-free for Roth/401k rebalancing", () => {
    const r = trimTax({ trimAmount: 10_000, gainPct: 80, capGainsRate: 18.8, stateRate: 5, taxAdvantaged: true });
    expect(r.tax).toBe(0);
    expect(r.net).toBe(10_000);
    expect(r.effectiveRate).toBe(0);
  });

  it("costs nothing when there is no unrealized gain (e.g. RSUs sold at vest)", () => {
    const r = trimTax({ trimAmount: 5_000, gainPct: 0, capGainsRate: 35, stateRate: 9, taxAdvantaged: false });
    expect(r.tax).toBe(0);
    expect(r.net).toBe(5_000);
  });
});
