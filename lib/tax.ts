/**
 * Estimate the after-tax cost of trimming a concentrated position. Deliberately
 * simple and transparent — an educational estimate, not tax advice. The LLM
 * never computes these; this is the deterministic source.
 */
export interface TrimTaxInput {
  /** Dollars of the position being sold. */
  trimAmount: number;
  /** Unrealized gain as a percentage of the position's value (0–100). */
  gainPct: number;
  /** Applicable federal rate %: long-term (incl. NIIT) or short-term/ordinary. */
  capGainsRate: number;
  /** State capital-gains rate %. */
  stateRate: number;
  /** Held in a Roth IRA / 401(k) — selling to rebalance is tax-free. */
  taxAdvantaged: boolean;
}

export interface TrimTaxResult {
  /** Capital gain realized by the trim. */
  realizedGain: number;
  /** Total estimated tax (federal + state). */
  tax: number;
  /** Dollars actually left to diversify after tax. */
  net: number;
  /** Tax as a percentage of the trimmed amount. */
  effectiveRate: number;
}

/** Default federal long-term rate: 15% LT cap gains + 3.8% NIIT. */
export const LONG_TERM_RATE = 18.8;
/** Default short-term/ordinary rate (illustrative high bracket). */
export const SHORT_TERM_RATE = 35;

export function trimTax(input: TrimTaxInput): TrimTaxResult {
  const trim = Math.max(0, input.trimAmount);
  const realizedGain = trim * (Math.max(0, input.gainPct) / 100);
  const rate = input.taxAdvantaged ? 0 : Math.max(0, input.capGainsRate) + Math.max(0, input.stateRate);
  const tax = realizedGain * (rate / 100);
  const net = trim - tax;
  const effectiveRate = trim > 0 ? (tax / trim) * 100 : 0;
  return { realizedGain, tax, net, effectiveRate };
}
