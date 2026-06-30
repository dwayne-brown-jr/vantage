import { describe, expect, it } from "vitest";

import { mergeImport } from "@/lib/store/shared";
import type { Holding, HoldingInput } from "@/lib/types";

const holding = (over: Partial<Holding>): Holding => ({
  id: over.id ?? "x",
  account: "Schwab · Individual ...945",
  symbol: "SWPPX",
  name: "Schwab S&P 500 Index",
  value: 6000,
  costBasis: 3000,
  assetClass: "us_large",
  quantity: null,
  price: null,
  source: "schwab-csv",
  updatedAt: null,
  ...over,
});

const input = (over: Partial<HoldingInput>): HoldingInput => ({
  account: "Schwab · Individual ...945",
  symbol: "SWPPX",
  name: "SCHWAB S&P 500 INDEX",
  value: 6527.88,
  costBasis: 3687.92,
  assetClass: "us_large",
  source: "schwab-csv",
  ...over,
});

describe("mergeImport — upsert by (account, symbol)", () => {
  it("appends genuinely new positions", () => {
    const r = mergeImport([], [input({}), input({ symbol: "AAPL", value: 281 })]);
    expect(r.created).toBe(2);
    expect(r.updated).toBe(0);
    expect(r.holdings).toHaveLength(2);
  });

  it("refreshes a matching position in place instead of duplicating it", () => {
    const existing = [holding({ id: "keep", value: 6000, costBasis: 3000 })];
    const r = mergeImport(existing, [input({ value: 6527.88, costBasis: 3687.92 })]);
    expect(r.created).toBe(0);
    expect(r.updated).toBe(1);
    expect(r.holdings).toHaveLength(1);
    expect(r.holdings[0]!.id).toBe("keep"); // same row, not a new id
    expect(r.holdings[0]!.value).toBeCloseTo(6527.88, 2);
    expect(r.holdings[0]!.costBasis).toBeCloseTo(3687.92, 2);
  });

  it("preserves the user's asset class and name when refreshing", () => {
    const existing = [holding({ assetClass: "spec", name: "My custom label" })];
    const r = mergeImport(existing, [input({ assetClass: "us_large", name: "SCHWAB S&P 500 INDEX" })]);
    expect(r.holdings[0]!.assetClass).toBe("spec"); // kept
    expect(r.holdings[0]!.name).toBe("My custom label"); // kept
  });

  it("matches case-insensitively on symbol", () => {
    const existing = [holding({ symbol: "swppx" })];
    const r = mergeImport(existing, [input({ symbol: "SWPPX" })]);
    expect(r.updated).toBe(1);
    expect(r.holdings).toHaveLength(1);
  });

  it("treats a different account as a separate position", () => {
    const existing = [holding({ account: "Schwab · Roth IRA" })];
    const r = mergeImport(existing, [input({ account: "Schwab · Individual ...945" })]);
    expect(r.created).toBe(1);
    expect(r.holdings).toHaveLength(2);
  });

  it("re-importing the exact same statement twice yields no growth", () => {
    const rows = [input({}), input({ symbol: "AAPL", value: 281, costBasis: 129 })];
    const first = mergeImport([], rows);
    const second = mergeImport(first.holdings, rows);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(2);
    expect(second.holdings).toHaveLength(2); // not 4
  });

  it("collapses duplicate rows within a single import", () => {
    const r = mergeImport([], [input({ value: 100 }), input({ value: 200 })]);
    expect(r.holdings).toHaveLength(1);
    expect(r.holdings[0]!.value).toBe(200); // last write wins
  });
});
