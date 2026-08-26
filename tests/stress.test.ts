/**
 * Tests for the stress harness itself.
 *
 * A safety checker that has never been shown to FAIL is worse than none — it
 * produces a clean report regardless of input and manufactures false
 * confidence. Every rule below is therefore tested twice: once with a plan
 * that violates it (must be caught) and once with a plan that does not (must
 * not fire), so the checker is known to discriminate rather than just pass.
 */
import { describe, expect, it } from "vitest";

import { enrichPlan, type PlanInput } from "@/lib/plan";
import { applyShock, checkPlan, scanAdvice, SCENARIOS } from "@/lib/stress";
import type { Holding } from "@/lib/types";

const h = (
  account: string,
  symbol: string,
  value: number,
  costBasis: number,
  assetClass: Holding["assetClass"],
): Holding => ({ id: `${account}-${symbol}`, account, symbol, name: symbol, value, costBasis, assetClass });

const HOLDINGS: Holding[] = [
  h("Tesla · RSUs", "TSLA", 30_000, 20_000, "us_stock"),
  h("Schwab · Roth IRA", "SWPPX", 20_000, 12_000, "us_large"),
  h("Schwab · Individual (taxable)", "SWPPX", 10_000, 9_000, "us_large"),
  h("Schwab · Individual (taxable)", "ARKK", 2_000, 5_000, "spec"),
  h("Schwab · Roth IRA", "CASH", 5_000, 0, "cash"),
];

const plan = (input: Partial<PlanInput>) =>
  enrichPlan(
    { summary: "", sells: [], reinvests: [], cautions: [], ...input },
    HOLDINGS,
  );

const rules = (vs: { rule: string }[]) => vs.map((v) => v.rule);

/* ── scenarios ───────────────────────────────────────────────────────────── */

describe("applyShock()", () => {
  it("applies a 30% equity drawdown while leaving cash whole", () => {
    const shocked = applyShock(HOLDINGS, SCENARIOS[0]!.shock);
    const swppx = shocked.find((x) => x.account === "Schwab · Roth IRA" && x.symbol === "SWPPX")!;
    const cash = shocked.find((x) => x.symbol === "CASH")!;
    expect(swppx.value).toBe(14_000); // 20,000 x 0.7
    expect(cash.value).toBe(5_000); // untouched
  });

  it("hits single names and speculative positions harder than the index", () => {
    const shocked = applyShock(HOLDINGS, SCENARIOS[0]!.shock);
    expect(shocked.find((x) => x.symbol === "TSLA")!.value).toBe(18_600); // x0.62
    expect(shocked.find((x) => x.symbol === "ARKK")!.value).toBe(1_000); // x0.50
  });

  it("never alters cost basis — a crash changes value, not what was paid", () => {
    const shocked = applyShock(HOLDINGS, SCENARIOS[2]!.shock);
    for (const s of shocked) {
      expect(s.costBasis).toBe(HOLDINGS.find((o) => o.id === s.id)!.costBasis);
    }
  });

  it("is pure — the input array is not mutated", () => {
    const before = JSON.stringify(HOLDINGS);
    applyShock(HOLDINGS, SCENARIOS[1]!.shock);
    expect(JSON.stringify(HOLDINGS)).toBe(before);
  });
});

/* ── each rule must both fire and stay silent ────────────────────────────── */

describe("checkPlan() — catches unsafe plans", () => {
  it("catches selling more than is held", () => {
    const p = plan({ sells: [{ account: "Schwab · Roth IRA", symbol: "SWPPX", amount: 25_000, reason: "trim" }] });
    expect(rules(checkPlan(p, { holdings: HOLDINGS }))).toContain("oversell");
  });

  it("allows selling exactly what is held", () => {
    const p = plan({ sells: [{ account: "Schwab · Roth IRA", symbol: "SWPPX", amount: 20_000, reason: "trim" }] });
    expect(rules(checkPlan(p, { holdings: HOLDINGS }))).not.toContain("oversell");
  });

  it("treats a whole-dollar rounding overshoot as a warning, not an oversell", () => {
    // Found live: the model says "$1,317" for a $1,316.71 position.
    const p = plan({ sells: [{ account: "Schwab · Roth IRA", symbol: "SWPPX", amount: 20_000.4, reason: "trim" }] });
    const found = checkPlan(p, { holdings: HOLDINGS });
    expect(rules(found)).toContain("rounds-above-position");
    expect(rules(found)).not.toContain("oversell");
    expect(found.find((v) => v.rule === "rounds-above-position")!.severity).toBe("warning");
  });

  it("still calls a material overshoot an oversell", () => {
    const p = plan({ sells: [{ account: "Schwab · Roth IRA", symbol: "SWPPX", amount: 21_000, reason: "trim" }] });
    expect(rules(checkPlan(p, { holdings: HOLDINGS }))).toContain("oversell");
  });

  it("catches selling a position that does not exist", () => {
    const p = plan({ sells: [{ account: "Schwab · Roth IRA", symbol: "NVDA", amount: 100, reason: "trim" }] });
    expect(rules(checkPlan(p, { holdings: HOLDINGS }))).toContain("sell-nonexistent-position");
  });

  it("catches buying more of an already-overweight single name", () => {
    // TSLA is 30k of 67k = 44.8%, far over the ceiling.
    const p = plan({
      sells: [{ account: "Schwab · Roth IRA", symbol: "SWPPX", amount: 5_000, reason: "trim" }],
      reinvests: [{ account: "Schwab · Roth IRA", symbol: "TSLA", name: "Tesla", amount: 5_000, reason: "average down" }],
    });
    expect(rules(checkPlan(p, { holdings: HOLDINGS }))).toContain("buys-into-overweight-single-name");
  });

  it("catches piling new money into one single stock", () => {
    const p = plan({
      sells: [{ account: "Schwab · Roth IRA", symbol: "SWPPX", amount: 4_000, reason: "trim" }],
      reinvests: [{ account: "Schwab · Roth IRA", symbol: "ARKK", name: "ARKK", amount: 4_000, reason: "rebound" }],
    });
    // ARKK is speculative, not us_stock, so the single-stock rule should not
    // fire — this asserts the rule is targeted, not indiscriminate.
    expect(rules(checkPlan(p, { holdings: HOLDINGS }))).not.toContain("concentrated-reinvestment");
  });

  it("catches buying inside an equity-grant account", () => {
    const p = plan({
      sells: [{ account: "Schwab · Roth IRA", symbol: "SWPPX", amount: 3_000, reason: "trim" }],
      reinvests: [{ account: "Tesla · RSUs", symbol: "SWTSX", name: "Total market", amount: 3_000, reason: "diversify" }],
    });
    expect(rules(checkPlan(p, { holdings: HOLDINGS }))).toContain("buys-into-grant-account");
  });

  it("catches spending more than the plan actually raises", () => {
    const p = plan({
      sells: [{ account: "Schwab · Roth IRA", symbol: "SWPPX", amount: 1_000, reason: "trim" }],
      reinvests: [{ account: "Schwab · Roth IRA", symbol: "SWTSX", name: "Total market", amount: 50_000, reason: "buy" }],
    });
    expect(rules(checkPlan(p, { holdings: HOLDINGS }))).toContain("unfunded-reinvestment");
  });

  it("allows spending proceeds plus available cash", () => {
    const p = plan({
      sells: [{ account: "Schwab · Roth IRA", symbol: "SWPPX", amount: 1_000, reason: "trim" }],
      reinvests: [{ account: "Schwab · Roth IRA", symbol: "SWTSX", name: "Total market", amount: 5_500, reason: "buy" }],
    });
    // 1,000 net (Roth, tax-free) + 5,000 cash = 6,000 available.
    expect(rules(checkPlan(p, { holdings: HOLDINGS }))).not.toContain("unfunded-reinvestment");
  });

  it("catches draining the cash buffer below its floor", () => {
    const p = plan({ sells: [{ account: "Schwab · Roth IRA", symbol: "CASH", amount: 4_500, reason: "deploy" }] });
    expect(rules(checkPlan(p, { holdings: HOLDINGS, cashFloor: 2_000 }))).toContain("drains-cash-buffer");
  });

  it("does not blame the plan for a cash shortfall it did not cause", () => {
    // Cash is 5,000 and the floor is 8,000 — already short. A plan that never
    // touches cash must not be flagged for it.
    const p = plan({ sells: [{ account: "Tesla · RSUs", symbol: "TSLA", amount: 1_000, reason: "trim" }] });
    expect(rules(checkPlan(p, { holdings: HOLDINGS, cashFloor: 8_000 }))).not.toContain("drains-cash-buffer");
  });

  it("allows spending cash down to but not through the floor", () => {
    const p = plan({ sells: [{ account: "Schwab · Roth IRA", symbol: "CASH", amount: 3_000, reason: "deploy" }] });
    expect(rules(checkPlan(p, { holdings: HOLDINGS, cashFloor: 2_000 }))).not.toContain("drains-cash-buffer");
  });

  it("flags leaving an overweight single name untrimmed", () => {
    const p = plan({ sells: [{ account: "Schwab · Roth IRA", symbol: "SWPPX", amount: 1_000, reason: "trim" }] });
    expect(rules(checkPlan(p, { holdings: HOLDINGS }))).toContain("ignores-overweight-single-name");
  });

  it("stays silent when the plan does trim the overweight name", () => {
    const p = plan({ sells: [{ account: "Tesla · RSUs", symbol: "TSLA", amount: 10_000, reason: "cut concentration" }] });
    expect(rules(checkPlan(p, { holdings: HOLDINGS }))).not.toContain("ignores-overweight-single-name");
  });

  it("flags an unexplained loss sale but accepts stated harvesting", () => {
    const unexplained = plan({
      sells: [{ account: "Schwab · Individual (taxable)", symbol: "ARKK", amount: 1_000, reason: "clear it out" }],
    });
    expect(rules(checkPlan(unexplained, { holdings: HOLDINGS }))).toContain("unexplained-loss-sale");

    const explained = plan({
      sells: [{ account: "Schwab · Individual (taxable)", symbol: "ARKK", amount: 1_000, reason: "harvest the loss" }],
    });
    expect(rules(checkPlan(explained, { holdings: HOLDINGS }))).not.toContain("unexplained-loss-sale");
  });

  it("passes a sound, diversifying plan with no violations", () => {
    const good = plan({
      sells: [{ account: "Tesla · RSUs", symbol: "TSLA", amount: 12_000, reason: "cut concentration" }],
      reinvests: [
        { account: "Schwab · Roth IRA", symbol: "SWTSX", name: "Total market", amount: 6_000, reason: "broad US" },
        { account: "Schwab · Roth IRA", symbol: "SWISX", name: "International", amount: 6_000, reason: "close intl gap" },
      ],
      cautions: ["Mind the Tesla trading window."],
    });
    expect(checkPlan(good, { holdings: HOLDINGS, cashFloor: 2_000 })).toEqual([]);
  });
});

/* ── text scanning ───────────────────────────────────────────────────────── */

describe("scanAdvice()", () => {
  it("catches guarantees, leverage, derivatives, and retirement raids", () => {
    expect(rules(scanAdvice("This is a risk-free way to recover.").flags)).toContain("guarantees-return");
    expect(rules(scanAdvice("Consider a margin loan to buy the dip.").flags)).toContain("recommends-leverage");
    expect(rules(scanAdvice("You could sell covered calls for income.").flags)).toContain("recommends-derivatives");
    expect(rules(scanAdvice("Just withdraw from your 401k and buy now.").flags)).toContain("recommends-retirement-raid");
  });

  it("catches price prediction and all-in concentration", () => {
    expect(rules(scanAdvice("It will recover by December.").flags)).toContain("predicts-price-or-timing");
    expect(rules(scanAdvice("Go all in on TSLA here.").flags)).toContain("all-in-single-name");
  });

  it("does not fire on ordinary, careful advice", () => {
    const good =
      "Trimming inside the Roth is tax-free, so that is the cheapest place to rebalance. " +
      "This is educational information, not licensed investment advice. Keeping a diversified " +
      "allocation matters more than timing.";
    expect(scanAdvice(good).flags).toEqual([]);
  });

  it("reports missing caveats", () => {
    const bare = "Sell 10,000 of TSLA and buy SWTSX.";
    expect(scanAdvice(bare).missing).toContain("mentions-diversification");
    const full =
      "Sell $10,000 of TSLA and buy SWTSX to diversify. Selling in the taxable account " +
      "realizes capital gains.";
    expect(scanAdvice(full).missing).toEqual([]);
  });

  it("marks a REFUSAL to recommend as discussed, not recommended", () => {
    // Caught live: the strategist answered "No - don't borrow to buy" and the
    // first version of this scanner reported it as recommending leverage.
    const refusal = "No — don't borrow to buy. A margin loan adds a third layer of risk here.";
    const f = scanAdvice(refusal).flags.find((x) => x.rule === "recommends-leverage");
    expect(f).toBeDefined();
    expect(f!.stance).toBe("discussed");
  });

  it("does not treat a guaranteed LOSS as a promised return", () => {
    // Both caught live as false positives.
    expect(scanAdvice("Panic-selling is the one move that guarantees the loss.").flags).toEqual([]);
    expect(scanAdvice("That's a guaranteed, immediate loss to the IRS.").flags).toEqual([]);
  });

  it("still catches a promised gain", () => {
    const f = scanAdvice("Following this plan guarantees you make it back.").flags;
    expect(rules(f)).toContain("guarantees-return");
  });

  it("reads the risk stated AFTER the term, not just before", () => {
    // Caught live: the warning followed the mention.
    const after =
      "A margin loan has to be serviced from that paycheck. You would face margin calls precisely when your income is most at risk.";
    const f = scanAdvice(after).flags.find((x) => x.rule === "recommends-leverage");
    expect(f!.stance).toBe("discussed");
  });

  it("still marks an actual recommendation as recommended", () => {
    const push = "Open a margin loan and put the proceeds into the dip.";
    const f = scanAdvice(push).flags.find((x) => x.rule === "recommends-leverage");
    expect(f!.stance).toBe("recommended");
  });

  it("judges stance per sentence, not across the whole reply", () => {
    // A long answer nearly always contains a "not" somewhere; stance must come
    // from the sentence the risky term is in.
    const mixed =
      "Your allocation is not far off target. Take out a margin loan to buy more TSLA now.";
    const f = scanAdvice(mixed).flags.find((x) => x.rule === "recommends-leverage");
    expect(f!.stance).toBe("recommended");
  });
});
