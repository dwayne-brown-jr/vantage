import { describe, expect, it } from "vitest";

import { enrichReconciliation, matchHolding, proposalPatch, type ReconcileInput } from "@/lib/reconcile";
import type { Holding } from "@/lib/types";

const holdings: Holding[] = [
  { id: "r1", account: "Schwab · Roth IRA", symbol: "CASH", name: "Cash", value: 320, costBasis: 320, assetClass: "cash" },
  { id: "r2", account: "Schwab · Roth IRA", symbol: "NVDA", name: "NVIDIA", value: 2124, costBasis: 1500, assetClass: "us_stock" },
  { id: "t1", account: "Schwab · Individual (taxable)", symbol: "NVDA", name: "NVIDIA", value: 636, costBasis: 556, assetClass: "us_stock" },
  { id: "f1", account: "Fidelity · Tesla 401(k)", symbol: "SP500", name: "S&P 500 Index", value: 17471, costBasis: 12000, assetClass: "us_large" },
];

const input = (proposals: ReconcileInput["proposals"]): ReconcileInput => ({
  proposals,
  needStatement: [],
  notes: [],
});

describe("matchHolding()", () => {
  it("matches on exact account + symbol", () => {
    expect(matchHolding(holdings, "Schwab · Roth IRA", "NVDA")?.id).toBe("r2");
  });

  it("matches a partial account label from a statement header", () => {
    // A statement may say just "Roth IRA" where the ledger says "Schwab · Roth IRA".
    expect(matchHolding(holdings, "Roth IRA", "NVDA")?.id).toBe("r2");
  });

  it("refuses to guess when a symbol is ambiguous across accounts", () => {
    // NVDA exists in two accounts — an unqualified match must not pick one.
    expect(matchHolding(holdings, "Unknown Brokerage", "NVDA")).toBeNull();
  });

  it("falls back to symbol-only when exactly one row carries it", () => {
    expect(matchHolding(holdings, "whatever", "SP500")?.id).toBe("f1");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(matchHolding(holdings, "  schwab · ROTH ira ", "nvda")?.id).toBe("r2");
  });
});

describe("enrichReconciliation() — the cash-contribution case", () => {
  it("computes the before/after and keeps cash basis equal to value", () => {
    const r = enrichReconciliation(
      input([
        {
          kind: "update",
          account: "Schwab · Roth IRA",
          symbol: "CASH",
          value: 10701.2,
          confidence: "high",
          observed: "Cash & Cash Investments $10,701.20",
          reason: "fresh contribution not yet in the ledger",
        },
      ]),
      holdings,
    );

    expect(r.proposals).toHaveLength(1);
    const p = r.proposals[0]!;
    expect(p.kind).toBe("update");
    expect(p.holdingId).toBe("r1");

    const value = p.changes.find((c) => c.field === "value")!;
    expect(value.from).toBe(320);
    expect(value.to).toBe(10701.2);

    // Cash has no gain, so basis must follow value — otherwise the contribution
    // would show up as a ~$10k phantom unrealized gain.
    const basis = p.changes.find((c) => c.field === "costBasis")!;
    expect(basis.to).toBe(10701.2);
    expect(p.warnings.some((w) => w.includes("no gain"))).toBe(true);
  });

  it("realigns a cash basis the model got wrong", () => {
    const r = enrichReconciliation(
      input([
        { kind: "update", account: "Schwab · Roth IRA", symbol: "CASH", value: 5000, costBasis: 320, confidence: "high", observed: "x", reason: "y" },
      ]),
      holdings,
    );
    expect(r.proposals[0]!.changes.find((c) => c.field === "costBasis")!.to).toBe(5000);
  });
});

describe("enrichReconciliation() — guardrails", () => {
  it("drops a proposal that already matches the ledger", () => {
    const r = enrichReconciliation(
      input([{ kind: "update", account: "Schwab · Roth IRA", symbol: "NVDA", value: 2124, confidence: "high", observed: "x", reason: "y" }]),
      holdings,
    );
    expect(r.proposals).toHaveLength(0);
    expect(r.rejected[0]?.why).toContain("already matches");
  });

  it("rejects negative and absurd figures rather than writing them", () => {
    const r = enrichReconciliation(
      input([
        { kind: "update", account: "Schwab · Roth IRA", symbol: "NVDA", value: -5, confidence: "high", observed: "x", reason: "y" },
        { kind: "update", account: "Schwab · Individual (taxable)", symbol: "NVDA", value: 1e12, confidence: "high", observed: "x", reason: "y" },
      ]),
      holdings,
    );
    expect(r.proposals).toHaveLength(0);
    expect(r.rejected).toHaveLength(2);
  });

  it("flags an order-of-magnitude jump (the OCR decimal slip)", () => {
    const r = enrichReconciliation(
      input([{ kind: "update", account: "Schwab · Roth IRA", symbol: "NVDA", value: 21240, confidence: "high", observed: "x", reason: "y" }]),
      holdings,
    );
    expect(r.proposals[0]!.warnings.some((w) => w.includes("double-check"))).toBe(true);
  });

  it("flags a position being zeroed out", () => {
    const r = enrichReconciliation(
      input([{ kind: "update", account: "Fidelity · Tesla 401(k)", symbol: "SP500", value: 0, confidence: "high", observed: "x", reason: "y" }]),
      holdings,
    );
    expect(r.proposals[0]!.warnings.some((w) => w.includes("$0"))).toBe(true);
  });

  it("surfaces low model confidence as a warning", () => {
    const r = enrichReconciliation(
      input([{ kind: "update", account: "Fidelity · Tesla 401(k)", symbol: "SP500", value: 18000, confidence: "low", observed: "x", reason: "y" }]),
      holdings,
    );
    expect(r.proposals[0]!.warnings.some((w) => w.includes("unsure"))).toBe(true);
  });

  it("drops a proposal carrying no readable figure", () => {
    const r = enrichReconciliation(
      input([{ kind: "update", account: "Schwab · Roth IRA", symbol: "NVDA", confidence: "high", observed: "x", reason: "y" }]),
      holdings,
    );
    expect(r.proposals).toHaveLength(0);
    expect(r.rejected[0]?.why).toContain("no usable figure");
  });
});

describe("enrichReconciliation() — adding a position it sees", () => {
  it("treats an unknown symbol as an add and defaults the asset class with a warning", () => {
    const r = enrichReconciliation(
      input([
        { kind: "add", account: "Schwab · Roth IRA", symbol: "VTI", name: "Vanguard Total Market", value: 4200, confidence: "high", observed: "VTI 20 sh $4,200.00", reason: "not in ledger" },
      ]),
      holdings,
    );
    const p = r.proposals[0]!;
    expect(p.kind).toBe("add");
    expect(p.holdingId).toBeNull();
    expect(p.assetClass).toBe("us_stock");
    expect(p.warnings.some((w) => w.includes("Asset class"))).toBe(true);
    expect(p.changes.find((c) => c.field === "value")!.from).toBeNull();
  });

  it("warns that a new position with no cost basis will overstate ROI", () => {
    const r = enrichReconciliation(
      input([
        { kind: "add", account: "Schwab · Roth IRA", symbol: "VTI", assetClass: "us_total", value: 3410.55, confidence: "high", observed: "x", reason: "y" },
      ]),
      holdings,
    );
    expect(r.proposals[0]!.warnings.some((w) => w.includes("cost basis"))).toBe(true);
  });

  it("does not warn about basis when the document showed one", () => {
    const r = enrichReconciliation(
      input([
        { kind: "add", account: "Schwab · Roth IRA", symbol: "VTI", assetClass: "us_total", value: 3410.55, costBasis: 3000, confidence: "high", observed: "x", reason: "y" },
      ]),
      holdings,
    );
    expect(r.proposals[0]!.warnings.some((w) => w.includes("cost basis"))).toBe(false);
  });

  it("exempts new cash rows from the basis warning", () => {
    const r = enrichReconciliation(
      input([
        { kind: "add", account: "Fidelity · Tesla 401(k)", symbol: "CASH", assetClass: "cash", value: 500, confidence: "high", observed: "x", reason: "y" },
      ]),
      holdings,
    );
    expect(r.proposals[0]!.warnings.some((w) => w.includes("overstates ROI"))).toBe(false);
  });

  it("honors an asset class the model did state", () => {
    const r = enrichReconciliation(
      input([
        { kind: "add", account: "Schwab · Roth IRA", symbol: "VXUS", name: "Intl", assetClass: "intl_dev", value: 900, confidence: "high", observed: "x", reason: "y" },
      ]),
      holdings,
    );
    expect(r.proposals[0]!.assetClass).toBe("intl_dev");
    expect(r.proposals[0]!.warnings.some((w) => w.includes("Asset class"))).toBe(false);
  });

  it("corrects the model when it calls an existing row an add", () => {
    // Existence in the ledger decides update-vs-add, not the model's label —
    // otherwise an "add" would duplicate a position instead of updating it.
    const r = enrichReconciliation(
      input([{ kind: "add", account: "Schwab · Roth IRA", symbol: "NVDA", value: 2500, confidence: "high", observed: "x", reason: "y" }]),
      holdings,
    );
    expect(r.proposals[0]!.kind).toBe("update");
    expect(r.proposals[0]!.holdingId).toBe("r2");
  });
});

describe("proposalPatch()", () => {
  it("builds a patch containing only the changed fields", () => {
    const r = enrichReconciliation(
      input([
        { kind: "update", account: "Schwab · Roth IRA", symbol: "NVDA", value: 2500, quantity: 12, confidence: "high", observed: "x", reason: "y" },
      ]),
      holdings,
    );
    expect(proposalPatch(r.proposals[0]!)).toEqual({ value: 2500, quantity: 12 });
  });
});

describe("enrichReconciliation() — statement requests", () => {
  it("passes through requests for a fuller statement", () => {
    const r = enrichReconciliation(
      {
        proposals: [],
        needStatement: [{ account: "Fidelity · Tesla 401(k)", why: "the screenshot cut off the fund list" }],
        notes: ["Only the summary page was visible."],
      },
      holdings,
    );
    expect(r.needStatement).toHaveLength(1);
    expect(r.notes).toHaveLength(1);
  });
});
