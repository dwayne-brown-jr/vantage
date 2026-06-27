/**
 * Structured rebalance plan. The LLM proposes the *moves* (which account, which
 * symbol, how much, why); the deterministic engine here computes every dollar of
 * tax consequence from the real holdings — the model never does the arithmetic.
 */
import { classifyAccount } from "@/lib/accounts";
import { LONG_TERM_RATE, trimTax } from "@/lib/tax";
import type { Holding } from "@/lib/types";

/* ── what the model proposes ─────────────────────────────────────────────── */
export interface PlanSellInput {
  account: string;
  symbol: string;
  /** Dollars to sell. */
  amount: number;
  reason: string;
}

export interface PlanBuyInput {
  account: string;
  symbol: string;
  name: string;
  /** Dollars to buy. */
  amount: number;
  reason: string;
}

export interface PlanInput {
  summary: string;
  sells: PlanSellInput[];
  reinvests: PlanBuyInput[];
  cautions: string[];
}

/* ── what we render (model's moves + deterministic tax) ──────────────────── */
export interface PlanSell extends PlanSellInput {
  /** Position ROI: unrealized gain as a % of cost basis (for display, app-wide convention). */
  roiPct: number;
  /** True when this account is tax-free to rebalance (Roth / 401k). */
  taxFree: boolean;
  /** Gain realized by the trim. */
  realizedGain: number;
  /** Estimated tax (0 in tax-advantaged accounts). */
  taxCost: number;
  /** Dollars left after tax. */
  netProceeds: number;
}

export interface Plan {
  summary: string;
  sells: PlanSell[];
  reinvests: PlanBuyInput[];
  cautions: string[];
  /** Sum of gross sell amounts. */
  totalSell: number;
  /** Sum of estimated tax across sells. */
  totalTax: number;
  /** Sum of net proceeds (what's actually freed to redeploy). */
  totalNet: number;
  /** Sum of reinvest amounts. */
  totalReinvest: number;
}

interface PositionStats {
  /** Unrealized gain as a % of cost basis (ROI — for display). */
  roiPct: number;
  /** Gain as a % of current value, clamped 0–100 — the taxable fraction of a sale. */
  gainOfValuePct: number;
}

/** Aggregate a (account, symbol) position from the real holdings. */
function positionStats(holdings: Holding[], account: string, symbol: string): PositionStats {
  const lots = holdings.filter(
    (h) => h.account === account && h.symbol.toUpperCase() === symbol.toUpperCase(),
  );
  const basis = lots.reduce((s, h) => s + (Number.isFinite(h.costBasis) ? h.costBasis : 0), 0);
  const value = lots.reduce((s, h) => s + h.value, 0);
  return {
    roiPct: basis > 0 ? ((value - basis) / basis) * 100 : 0,
    // Only the gain portion of a sale is taxed; it can't exceed 100% of proceeds,
    // and a position at a loss has no taxable gain.
    gainOfValuePct: value > 0 ? Math.min(100, Math.max(0, ((value - basis) / value) * 100)) : 0,
  };
}

/**
 * Attach deterministic tax math to the model's proposed sells and total it up.
 * Long-term rates assumed (educational); tax-advantaged accounts cost nothing.
 */
export function enrichPlan(input: PlanInput, holdings: Holding[]): Plan {
  const sells: PlanSell[] = input.sells.map((s) => {
    const tax = classifyAccount(s.account);
    const { roiPct, gainOfValuePct } = positionStats(holdings, s.account, s.symbol);
    const r = trimTax({
      trimAmount: s.amount,
      gainPct: gainOfValuePct,
      capGainsRate: LONG_TERM_RATE,
      stateRate: 0,
      taxAdvantaged: tax.taxFreeToRebalance,
    });
    return {
      ...s,
      roiPct,
      taxFree: tax.taxFreeToRebalance,
      realizedGain: r.realizedGain,
      taxCost: r.tax,
      netProceeds: r.net,
    };
  });

  return {
    summary: input.summary,
    sells,
    reinvests: input.reinvests,
    cautions: input.cautions,
    totalSell: sells.reduce((s, x) => s + x.amount, 0),
    totalTax: sells.reduce((s, x) => s + x.taxCost, 0),
    totalNet: sells.reduce((s, x) => s + x.netProceeds, 0),
    totalReinvest: input.reinvests.reduce((s, x) => s + x.amount, 0),
  };
}

/** JSON Schema for the `emit_plan` tool the model is forced to call. */
export const PLAN_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    summary: { type: "string", description: "One-line bottom line — the plan in a sentence." },
    sells: {
      type: "array",
      description: "Positions to sell, one row per account+symbol.",
      items: {
        type: "object",
        properties: {
          account: { type: "string", description: "Exact account name from the ledger." },
          symbol: { type: "string", description: "Ticker/symbol to sell." },
          amount: { type: "number", description: "Dollars to sell (integer)." },
          reason: { type: "string", description: "Short why — tax treatment, concentration, overweight." },
        },
        required: ["account", "symbol", "amount", "reason"],
      },
    },
    reinvests: {
      type: "array",
      description: "Where the freed cash goes, one row per account+fund.",
      items: {
        type: "object",
        properties: {
          account: { type: "string", description: "Destination account name." },
          symbol: { type: "string", description: "Ticker/fund to buy." },
          name: { type: "string", description: "Human name of the fund." },
          amount: { type: "number", description: "Dollars to buy (integer)." },
          reason: { type: "string", description: "Short why — which gap it closes, tax efficiency." },
        },
        required: ["account", "symbol", "name", "amount", "reason"],
      },
    },
    cautions: {
      type: "array",
      description: "Brief caveats (trading windows, taxes, assumptions).",
      items: { type: "string" },
    },
  },
  required: ["summary", "sells", "reinvests", "cautions"],
};
