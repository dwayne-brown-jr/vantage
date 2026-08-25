/**
 * Portfolio income and yield — deterministic, pure.
 *
 * Income is only knowable for a position where BOTH the share count and a
 * trailing dividend rate are known. Everything here is built around making
 * that partial knowledge explicit: a position we cannot price contributes
 * nothing to income, but it still counts toward the portfolio value the yield
 * is measured against, and the coverage figures say how much of the portfolio
 * the answer actually rests on.
 *
 * The alternative — quietly dividing known income by known value — would
 * report a confident yield computed from a fraction of the portfolio.
 */
import type { DividendRate } from "@/lib/datasource";
import { portfolioYield, roundMoney, sumMoney } from "@/lib/performance";
import type { Holding } from "@/lib/types";

export interface IncomePosition {
  symbol: string;
  account: string;
  marketValue: number;
  /** Shares held; null when the position is a manual dollar value. */
  quantity: number | null;
  /** Trailing-12-month dividends per share, or null when unknown. */
  ratePerShare: number | null;
  /** quantity × ratePerShare, or null when either is unknown. */
  annualIncome: number | null;
  /** annualIncome / marketValue × 100, or null when unknown. */
  yieldPct: number | null;
}

export interface IncomeSummary {
  positions: IncomePosition[];
  /** Summed annual income across positions we could compute. */
  annualIncome: number;
  /** annualIncome / 12. */
  monthlyIncome: number;
  /** Whole portfolio value, including positions we could not compute. */
  totalValue: number;
  /**
   * annualIncome / totalValue × 100 — the portfolio's yield, with unknown
   * positions counted in the denominator. Null when there is no value.
   * A floor, not an estimate: unknown positions can only push it up.
   */
  yieldPct: number | null;
  /** Market value of positions where income could be computed. */
  coveredValue: number;
  /** coveredValue / totalValue × 100. */
  coveragePct: number;
  /** Positions with a known income figure. */
  covered: number;
  /** Positions whose income is unknown (no shares, or no rate available). */
  uncovered: number;
  /** Symbols we could not compute, for an honest footnote. */
  uncoveredSymbols: string[];
  /** True when every non-cash position was resolved. */
  complete: boolean;
}

/**
 * Build the income picture from holdings plus whatever dividend rates were
 * resolved. Cash is excluded: money-market interest is not a dividend and is
 * not in the rate feed, so counting cash at a zero rate would drag the yield
 * down with a number we never actually looked up.
 */
export function buildIncome(holdings: Holding[], rates: DividendRate[]): IncomeSummary {
  const bySymbol = new Map(rates.map((r) => [r.symbol.toUpperCase(), r]));
  const nonCash = holdings.filter((h) => h.assetClass !== "cash");

  const positions: IncomePosition[] = nonCash.map((h) => {
    const rate = bySymbol.get(h.symbol.toUpperCase());
    const quantity = h.quantity != null && Number.isFinite(h.quantity) && h.quantity > 0 ? h.quantity : null;
    const ratePerShare = rate ? rate.trailingPerShare : null;
    const annualIncome =
      quantity != null && ratePerShare != null ? roundMoney(quantity * ratePerShare) : null;
    return {
      symbol: h.symbol,
      account: h.account,
      marketValue: h.value,
      quantity,
      ratePerShare,
      annualIncome,
      yieldPct: annualIncome != null && h.value > 0 ? (annualIncome / h.value) * 100 : null,
    };
  });

  const knowable = positions.filter((p) => p.annualIncome != null);
  const unknown = positions.filter((p) => p.annualIncome == null);

  const annualIncome = sumMoney(knowable.map((p) => p.annualIncome as number));
  // Denominator is the whole portfolio, cash included: "the portfolio yields
  // X%" means against everything owned, not just the dividend payers.
  const totalValue = sumMoney(holdings.map((h) => h.value));
  const coveredValue = sumMoney(knowable.map((p) => p.marketValue));

  const summary = portfolioYield(
    knowable.map((p) => ({
      symbol: p.symbol,
      marketValue: p.marketValue,
      annualIncome: p.annualIncome as number,
    })),
  );

  return {
    positions: positions.sort((a, b) => (b.annualIncome ?? -1) - (a.annualIncome ?? -1)),
    annualIncome,
    monthlyIncome: summary.monthlyIncome,
    totalValue,
    yieldPct: totalValue > 0 ? (annualIncome / totalValue) * 100 : null,
    coveredValue,
    coveragePct: totalValue > 0 ? (coveredValue / totalValue) * 100 : 0,
    covered: knowable.length,
    uncovered: unknown.length,
    uncoveredSymbols: [...new Set(unknown.map((p) => p.symbol))],
    complete: unknown.length === 0,
  };
}
