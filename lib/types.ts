/**
 * Core domain types for Vantage.
 *
 * The holding schema is deliberately structured so a live price feed and
 * account aggregation (Plaid Investments / SnapTrade) can be layered on later
 * (see lib/datasource) without reshaping the model: `value` is the current
 * market value (a manual snapshot today), while `quantity`/`price` are reserved
 * for when values become derived (value = quantity * price).
 */

/** Display-level asset classes (the taxonomy from the prototype). */
export type AssetClassKey =
  | "us_large" // US large-cap index
  | "us_total" // US total market
  | "us_stock" // US single stocks
  | "intl_dev" // International developed
  | "intl_em" //  Emerging markets
  | "div_value" // Dividend / value
  | "sector" //   Sector bets
  | "spec" //     Speculative
  | "tdf" //      Target-date blend (decomposed into us/intl/bond)
  | "cash"; //    Cash

/** High-level buckets used for the US / International / Bonds / Cash mix. */
export type Bucket = "US equity" | "International" | "Blend" | "Cash";

export interface Holding {
  id: string;
  account: string;
  symbol: string;
  name: string;
  /** Current market value. A manual snapshot today; may become derived later. */
  value: number;
  /** Total cost basis. 0 when unknown (e.g. cash / money market). */
  costBasis: number;
  assetClass: AssetClassKey;

  // ── forward-looking fields (optional; unused by the current math) ──
  /** Share/unit count — populated once a live feed or aggregation is wired in. */
  quantity?: number | null;
  /** Per-share price — value = quantity * price once values are derived. */
  price?: number | null;
  /** Where this row came from: "manual" | "schwab-csv" | "plaid" | … */
  source?: string | null;
  /** ISO timestamp of the last value update. */
  updatedAt?: string | null;

  /**
   * Value that is NOT yet owned — unvested equity comp (RSUs that would be
   * forfeited on leaving, E*Trade's "Potential Benefit Value").
   *
   * Deliberately separate from `value` and EXCLUDED from every portfolio
   * total: it is contingent future compensation, not an asset held today, and
   * counting it would overstate both net worth and any allocation computed
   * from it. Analytics surfaces it on its own so the concentration risk it
   * represents stays visible without polluting the totals.
   */
  unvested?: number | null;
}

/** A holding without server-managed fields — what the UI/import layer submits. */
export type HoldingInput = Omit<Holding, "id"> & { id?: string };
