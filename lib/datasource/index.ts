/**
 * Data-source adapter interface (STUB — not implemented yet).
 *
 * Today every holding is a manual snapshot persisted in the local SQLite file.
 * This is the seam where a live price feed or brokerage aggregation would plug
 * in later (e.g. Plaid Investments, SnapTrade, or a quote provider). Keep the
 * interface here; build implementations only when wiring a real feed.
 */
import type { Holding } from "@/lib/types";

export interface PriceQuote {
  symbol: string;
  /** Per-share price. */
  price: number;
  /** ISO timestamp the quote was observed. */
  asOf: string;
}

export interface DataSourceAdapter {
  readonly id: string;
  readonly label: string;
  /** Pull fresh per-share prices for the given symbols. */
  fetchQuotes?(symbols: string[]): Promise<PriceQuote[]>;
  /** Pull full positions from a linked brokerage. */
  fetchHoldings?(): Promise<Holding[]>;
}

/** Registry of available adapters. Empty until a real feed is implemented. */
export const adapters: DataSourceAdapter[] = [];
