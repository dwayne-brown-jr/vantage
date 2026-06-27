import { describe, expect, it } from "vitest";

import { enrichPlan, type PlanInput } from "@/lib/plan";
import { ACCOUNTS, SEED_HOLDINGS } from "@/lib/seed";

describe("enrichPlan — deterministic tax math over the model's moves", () => {
  it("a Roth sell is tax-free; net proceeds equal the amount", () => {
    const input: PlanInput = {
      summary: "test",
      sells: [{ account: ACCOUNTS.roth, symbol: "NVDA", amount: 500, reason: "trim" }],
      reinvests: [],
      cautions: [],
    };
    const plan = enrichPlan(input, SEED_HOLDINGS);
    const sell = plan.sells[0]!;
    expect(sell.taxFree).toBe(true);
    expect(sell.taxCost).toBe(0);
    expect(sell.netProceeds).toBe(500);
    // ROI is still surfaced for display (NVDA in the Roth is a big winner).
    expect(sell.roiPct).toBeGreaterThan(100);
  });

  it("a taxable sell taxes only the gain fraction of the proceeds (never more than the trim)", () => {
    // Taxable NVDA: value 635.84, basis 556.34 → gain ≈ 12.5% of value.
    const input: PlanInput = {
      summary: "test",
      sells: [{ account: ACCOUNTS.taxable, symbol: "NVDA", amount: 100, reason: "trim" }],
      reinvests: [],
      cautions: [],
    };
    const sell = enrichPlan(input, SEED_HOLDINGS).sells[0]!;
    expect(sell.taxFree).toBe(false);
    // Realized gain is a fraction of the $100 trimmed, not a multiple of it.
    expect(sell.realizedGain).toBeGreaterThan(0);
    expect(sell.realizedGain).toBeLessThan(100);
    expect(sell.taxCost).toBeGreaterThan(0);
    expect(sell.taxCost).toBeLessThan(sell.realizedGain);
    expect(sell.netProceeds).toBeCloseTo(100 - sell.taxCost, 6);
  });

  it("an RSU sell at vest basis (≈no gain) costs ≈no tax", () => {
    // TSLA RSUs: value 30000, basis 30000 → 0 gain.
    const input: PlanInput = {
      summary: "test",
      sells: [{ account: ACCOUNTS.rsu, symbol: "TSLA", amount: 15000, reason: "diversify" }],
      reinvests: [],
      cautions: [],
    };
    const sell = enrichPlan(input, SEED_HOLDINGS).sells[0]!;
    expect(sell.taxCost).toBeCloseTo(0, 6);
    expect(sell.netProceeds).toBeCloseTo(15000, 6);
  });

  it("totals sum the per-move figures", () => {
    const input: PlanInput = {
      summary: "test",
      sells: [
        { account: ACCOUNTS.rsu, symbol: "TSLA", amount: 15000, reason: "a" },
        { account: ACCOUNTS.roth, symbol: "NVDA", amount: 500, reason: "b" },
      ],
      reinvests: [
        { account: ACCOUNTS.roth, symbol: "SCHE", name: "EM", amount: 8000, reason: "c" },
        { account: ACCOUNTS.k401, symbol: "BND", name: "Bonds", amount: 6000, reason: "d" },
      ],
      cautions: [],
    };
    const plan = enrichPlan(input, SEED_HOLDINGS);
    expect(plan.totalSell).toBe(15500);
    expect(plan.totalReinvest).toBe(14000);
    expect(plan.totalNet).toBeCloseTo(plan.sells.reduce((s, x) => s + x.netProceeds, 0), 6);
    expect(plan.totalTax).toBeCloseTo(plan.sells.reduce((s, x) => s + x.taxCost, 0), 6);
  });
});
