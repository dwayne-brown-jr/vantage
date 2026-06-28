import { describe, expect, it } from "vitest";

import { classifyAccount } from "@/lib/accounts";
import { analyze } from "@/lib/analytics";
import { DEFAULT_TARGETS } from "@/lib/constants";
import { enrichPlan } from "@/lib/plan";
import { computeRebalance } from "@/lib/rebalance";
import { ACCOUNTS, SEED_HOLDINGS } from "@/lib/seed";

const a = analyze(SEED_HOLDINGS);

describe("computeRebalance — target-driven deterministic rebalance", () => {
  it("sells from the over-weighted US-equity bucket and buys international + bonds", () => {
    const plan = computeRebalance(SEED_HOLDINGS, a, DEFAULT_TARGETS);
    expect(plan.sells.length).toBeGreaterThan(0);
    expect(plan.reinvests.length).toBeGreaterThan(0);
    // International is badly under target → must appear as a buy.
    const buysIntl = plan.reinvests.some((r) => /SWISX|SCHE|VXUS|intl/i.test(r.symbol + r.name));
    expect(buysIntl).toBe(true);
    // Bonds has no standalone holding → a suggested bond fund buy.
    const buysBonds = plan.reinvests.some((r) => /BND|bond/i.test(r.symbol + r.name));
    expect(buysBonds).toBe(true);
  });

  it("never sells the taxable SWPPX hold", () => {
    const plan = computeRebalance(SEED_HOLDINGS, a, DEFAULT_TARGETS);
    const soldTaxableSwppx = plan.sells.some(
      (s) => s.symbol === "SWPPX" && classifyAccount(s.account).treatment === "taxable",
    );
    expect(soldTaxableSwppx).toBe(false);
  });

  it("never trims the target-date fund", () => {
    const plan = computeRebalance(SEED_HOLDINGS, a, DEFAULT_TARGETS);
    expect(plan.sells.some((s) => s.symbol === "TRP2060")).toBe(false);
  });

  it("prefers tax-free accounts — every sell is tax-free for the seed portfolio", () => {
    // There is enough tax-advantaged US equity to cover the whole trim.
    const plan = enrichPlan(computeRebalance(SEED_HOLDINGS, a, DEFAULT_TARGETS), SEED_HOLDINGS);
    expect(plan.totalTax).toBe(0);
    expect(plan.sells.every((s) => s.taxFree)).toBe(true);
  });

  it("with targets equal to the current mix, proposes no moves", () => {
    const current = {
      "US equity": a.usEquityPct,
      International: a.intlPct,
      Bonds: a.bondPct,
      Cash: a.cashPct,
    };
    const plan = computeRebalance(SEED_HOLDINGS, a, current);
    expect(plan.sells).toHaveLength(0);
    expect(plan.reinvests).toHaveLength(0);
    expect(plan.summary).toMatch(/no rebalancing needed/i);
  });

  it("flags targets that don't sum to 100%", () => {
    const plan = computeRebalance(SEED_HOLDINGS, a, { "US equity": 50, International: 20, Bonds: 5, Cash: 5 });
    expect(plan.cautions.some((c) => /not 100%/.test(c))).toBe(true);
  });

  it("routes a bond buy into the tax-deferred 401(k)", () => {
    const plan = computeRebalance(SEED_HOLDINGS, a, DEFAULT_TARGETS);
    const bondBuy = plan.reinvests.find((r) => /BND|bond/i.test(r.symbol + r.name));
    expect(bondBuy?.account).toBe(ACCOUNTS.k401);
  });
});
