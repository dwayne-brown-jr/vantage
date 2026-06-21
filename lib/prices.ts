import type { PriceQuote } from "@/lib/datasource";
import type { Holding } from "@/lib/types";

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export interface RepriceResult {
  holdings: Holding[];
  /** Symbols a quote was found for. */
  priced: string[];
  /** Non-cash symbols with no quote (stay manual). */
  unresolved: string[];
  /** Symbols whose value was recomputed from shares × price. */
  valueUpdated: string[];
}

/**
 * Apply quotes to holdings. For any holding with a quote:
 *   - stores the latest per-share price,
 *   - if `estimateShares` is set and it has no share count yet, derives one from
 *     its current value (value / price) so it can go live without manual entry,
 *   - if it has a share count, recomputes value = shares × price.
 * Cash and quote-less holdings (e.g. 401k collective funds) are left untouched.
 */
export function repriceHoldings(
  holdings: Holding[],
  quotes: PriceQuote[],
  opts: { estimateShares?: boolean } = {},
): RepriceResult {
  const bySymbol = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));
  const priced: string[] = [];
  const unresolved: string[] = [];
  const valueUpdated: string[] = [];

  const updated = holdings.map((h) => {
    if (h.assetClass === "cash") return h;

    const quote = bySymbol.get(h.symbol.toUpperCase());
    if (!quote || quote.price <= 0) {
      unresolved.push(h.symbol);
      return h;
    }
    priced.push(h.symbol);

    let quantity = h.quantity ?? null;
    if (opts.estimateShares && (quantity == null || quantity === 0) && h.value > 0) {
      quantity = round(h.value / quote.price, 6);
    }

    const next: Holding = { ...h, price: quote.price, quantity, updatedAt: quote.asOf };
    if (quantity != null && quantity > 0) {
      next.value = round(quantity * quote.price, 2);
      valueUpdated.push(h.symbol);
    }
    return next;
  });

  return { holdings: updated, priced, unresolved, valueUpdated };
}
