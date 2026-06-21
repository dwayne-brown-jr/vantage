import { describe, expect, it } from "vitest";

import { parseYahooQuote, type PriceQuote } from "@/lib/datasource";
import { repriceHoldings } from "@/lib/prices";
import type { Holding } from "@/lib/types";

const h = (over: Partial<Holding>): Holding => ({
  id: over.id ?? "x",
  account: "A",
  symbol: over.symbol ?? "TSLA",
  name: over.name ?? "",
  value: over.value ?? 0,
  costBasis: over.costBasis ?? 0,
  assetClass: over.assetClass ?? "us_stock",
  quantity: over.quantity ?? null,
  price: over.price ?? null,
  source: "manual",
  updatedAt: null,
});

const quote = (symbol: string, price: number): PriceQuote => ({ symbol, price, asOf: "2026-06-18T22:00:00.000Z" });

describe("repriceHoldings()", () => {
  it("recomputes value = shares × price for holdings with a share count", () => {
    const r = repriceHoldings([h({ symbol: "TSLA", quantity: 10, value: 1 })], [quote("TSLA", 400)]);
    expect(r.holdings[0]!.value).toBe(4000);
    expect(r.holdings[0]!.price).toBe(400);
    expect(r.valueUpdated).toEqual(["TSLA"]);
    expect(r.priced).toEqual(["TSLA"]);
  });

  it("estimateShares derives a share count from current value, keeping value stable", () => {
    const r = repriceHoldings([h({ symbol: "SWPPX", value: 6626.64, quantity: null })], [quote("SWPPX", 19.32)], {
      estimateShares: true,
    });
    expect(r.holdings[0]!.quantity).toBeCloseTo(6626.64 / 19.32, 4);
    expect(r.holdings[0]!.value).toBeCloseTo(6626.64, 1);
    expect(r.valueUpdated).toContain("SWPPX");
  });

  it("without a share count and without estimateShares, stores the price but leaves value untouched", () => {
    const r = repriceHoldings([h({ symbol: "NVDA", value: 635.84, quantity: null })], [quote("NVDA", 210)]);
    expect(r.holdings[0]!.value).toBe(635.84);
    expect(r.holdings[0]!.price).toBe(210);
    expect(r.valueUpdated).toEqual([]);
  });

  it("leaves cash and quote-less holdings (e.g. 401k collective funds) untouched", () => {
    const r = repriceHoldings(
      [h({ symbol: "CASH", assetClass: "cash", value: 200 }), h({ symbol: "TRP2060", assetClass: "tdf", value: 17742.81 })],
      [], // no quotes returned
    );
    expect(r.holdings[0]!.value).toBe(200);
    expect(r.holdings[1]!.value).toBe(17742.81);
    expect(r.unresolved).toEqual(["TRP2060"]); // cash is not flagged
  });
});

describe("parseYahooQuote()", () => {
  it("extracts the regular market price", () => {
    const json = {
      chart: { result: [{ meta: { symbol: "TSLA", regularMarketPrice: 400.49, currency: "USD", regularMarketTime: 1_750_000_000 } }] },
    };
    const q = parseYahooQuote(json, "TSLA");
    expect(q).not.toBeNull();
    expect(q!.price).toBe(400.49);
    expect(q!.symbol).toBe("TSLA");
  });

  it("returns null when there is no price", () => {
    expect(parseYahooQuote({ chart: { result: [{ meta: {} }] } }, "X")).toBeNull();
    expect(parseYahooQuote({ chart: { error: { code: "Not Found" } } }, "TRP2060")).toBeNull();
    expect(parseYahooQuote(null, "X")).toBeNull();
  });
});
