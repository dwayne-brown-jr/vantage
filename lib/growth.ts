/**
 * Portfolio growth over the snapshot history — deterministic, pure.
 *
 * The hard rule here: DO NOT ANNUALIZE A SHORT PERIOD. Compounding a few days
 * of movement out to a year manufactures enormous, meaningless numbers — a
 * 2% move over three days annualizes past 700%. Standard practice in
 * performance reporting is that periods under one year are shown cumulatively
 * and not annualized, and that is what this does.
 *
 * The result therefore carries a `status` describing what it is allowed to
 * say, so the UI renders an honest state instead of a confident wrong figure.
 */
import { cagr, simpleReturn } from "@/lib/performance";
import type { Snapshot } from "@/lib/snapshots";

/** Days of history below which nothing at all is reported. */
export const MIN_DAYS_FOR_RETURN = 7;
/** Days of history required before a return may be annualized. */
export const MIN_DAYS_FOR_CAGR = 365;

const MS_PER_DAY = 86_400_000;

export type GrowthStatus =
  /** Fewer than two snapshots, or a span under MIN_DAYS_FOR_RETURN. */
  | "insufficient"
  /** Enough history for a cumulative return, too little to annualize. */
  | "cumulative"
  /** A year or more — CAGR is meaningful. */
  | "annualized";

export interface GrowthResult {
  status: GrowthStatus;
  /** Days between the first and last snapshot. */
  days: number;
  /** Whole days still needed before the next status is reached; 0 once there. */
  daysUntilNext: number;
  /** Cumulative return over the whole span, as a percentage. Null if unknown. */
  totalReturnPct: number | null;
  /** Compound annual growth rate. Null unless status is "annualized". */
  cagrPct: number | null;
  /** Value at the start of the window. */
  startValue: number | null;
  /** Value at the end of the window. */
  endValue: number | null;
  /** YYYY-MM-DD of the first snapshot. */
  startDay: string | null;
  /** YYYY-MM-DD of the last snapshot. */
  endDay: string | null;
}

const EMPTY: GrowthResult = {
  status: "insufficient",
  days: 0,
  daysUntilNext: MIN_DAYS_FOR_RETURN,
  totalReturnPct: null,
  cagrPct: null,
  startValue: null,
  endValue: null,
  startDay: null,
  endDay: null,
};

/**
 * Growth across the full snapshot history.
 *
 * Note this is a value-to-value comparison: it does not know about deposits,
 * so money paid in during the window reads as growth. With contribution data
 * this should move to lib/performance.ts's `totalReturn`, which subtracts
 * flows. Until then the figure is honest only for a portfolio that is not
 * being added to — which is why the UI labels it "value change", not "return".
 */
export function portfolioGrowth(snapshots: Snapshot[]): GrowthResult {
  const sorted = [...snapshots]
    .filter((s) => Number.isFinite(s.total) && s.total > 0)
    .sort((a, b) => a.day.localeCompare(b.day));

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last || sorted.length < 2) {
    return { ...EMPTY, startDay: first?.day ?? null, startValue: first?.total ?? null };
  }

  const ms = Date.parse(`${last.day}T00:00:00Z`) - Date.parse(`${first.day}T00:00:00Z`);
  const days = Number.isFinite(ms) ? Math.round(ms / MS_PER_DAY) : 0;

  const base = {
    days,
    startValue: first.total,
    endValue: last.total,
    startDay: first.day,
    endDay: last.day,
  };

  if (days < MIN_DAYS_FOR_RETURN) {
    return {
      ...base,
      status: "insufficient",
      daysUntilNext: MIN_DAYS_FOR_RETURN - days,
      totalReturnPct: null,
      cagrPct: null,
    };
  }

  const totalReturnPct = simpleReturn(first.total, last.total);

  if (days < MIN_DAYS_FOR_CAGR) {
    return {
      ...base,
      status: "cumulative",
      daysUntilNext: MIN_DAYS_FOR_CAGR - days,
      totalReturnPct,
      cagrPct: null,
    };
  }

  return {
    ...base,
    status: "annualized",
    daysUntilNext: 0,
    totalReturnPct,
    cagrPct: cagr(first.total, last.total, days / 365.25),
  };
}
