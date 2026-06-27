/**
 * Account tax treatment — the single source of truth for how selling inside a
 * given account is taxed. Used by the strategist context builder and the plan
 * endpoint so both reason about the same rules. Pure + deterministic; the LLM
 * never decides tax treatment.
 */

export type TaxTreatment = "taxable" | "roth" | "traditional" | "rsu";

export interface AccountTax {
  treatment: TaxTreatment;
  /** Short label, e.g. "Roth IRA". */
  label: string;
  /** True when selling to rebalance triggers no current tax. */
  taxFreeToRebalance: boolean;
  /** One-line description of the tax consequence of selling here. */
  note: string;
}

/**
 * Classify an account string (e.g. "Schwab · Roth IRA") into its tax treatment.
 * Matching is keyword-based and order-sensitive: Roth before traditional, RSU
 * before the taxable fallback.
 */
export function classifyAccount(account: string): AccountTax {
  const a = account.toLowerCase();

  if (a.includes("roth")) {
    return {
      treatment: "roth",
      label: "Roth IRA",
      taxFreeToRebalance: true,
      note: "Roth — tax-free to rebalance; growth and qualified withdrawals are tax-free. Cheapest place to trim.",
    };
  }

  if (a.includes("rsu")) {
    return {
      treatment: "rsu",
      label: "RSUs",
      taxFreeToRebalance: false,
      note: "RSUs — taxed as ordinary income at vest; selling realizes capital gain/loss vs the vest-date basis. Mind trading windows.",
    };
  }

  if (a.includes("401") || a.includes("403") || a.includes("ira")) {
    return {
      treatment: "traditional",
      label: "Tax-deferred",
      taxFreeToRebalance: true,
      note: "Tax-deferred — no tax to rebalance inside; ordinary income only on withdrawal.",
    };
  }

  return {
    treatment: "taxable",
    label: "Taxable",
    taxFreeToRebalance: false,
    note: "Taxable — selling realizes capital-gains tax on the gain portion (≈18.8% long-term).",
  };
}
