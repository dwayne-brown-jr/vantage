/**
 * Time-weighted performance math — CAGR, total return, and yield.
 *
 * Like lib/analytics.ts, this is pure and deterministic: same inputs, same
 * outputs, no clock, no I/O. Every function returns `null` rather than NaN or
 * Infinity when the maths is undefined (a zero starting value, a zero span),
 * so a caller can never render "NaN%" or silently treat garbage as a figure.
 *
 * Money is handled in integer cents wherever a value is rounded. IEEE-754
 * doubles cannot represent most decimal fractions exactly — 0.1 + 0.2 is
 * 0.30000000000000004 — so summing dollars as floats accumulates drift, and
 * `Math.round(x * 100) / 100` disagrees with `x.toFixed(2)` on exact halves
 * (2.675 rounds up under one and down under the other). `roundMoney` below
 * pins that down to a single documented convention.
 */

/** Days in a year used to convert a date span into a year fraction (ACT/365.25). */
export const DAYS_PER_YEAR = 365.25;

const MS_PER_DAY = 86_400_000;

/* ── money ───────────────────────────────────────────────────────────────── */

/**
 * Round to whole cents, half away from zero (2.675 → 2.68, −2.675 → −2.68).
 *
 * The naive `Math.round(n * 100) / 100` is wrong twice over: it rounds half
 * toward +Infinity (so −0.005 becomes −0.00 rather than −0.01), and the
 * multiply itself introduces error — 1.005 * 100 is 100.49999999999999, which
 * rounds *down* to 1.00 when the decimal literal a human wrote means 1.01.
 * Correcting on the scaled value with a relative epsilon fixes both.
 */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const scaled = n * 100;
  // Nudge by one part in ~1e12 of the magnitude: enough to defeat the
  // representation error above, far too small to move a genuine .004 or .006.
  const epsilon = Math.abs(scaled) * 1e-12;
  const corrected = scaled >= 0 ? scaled + epsilon : scaled - epsilon;
  const cents = corrected >= 0 ? Math.floor(corrected + 0.5) : Math.ceil(corrected - 0.5);
  // `+ 0` normalises -0 to 0 so a rounded-away loss never displays as "-$0.00".
  return cents / 100 + 0;
}

/** Exact whole cents for a dollar amount. Use to sum money without drift. */
export function toCents(n: number): number {
  return Number.isFinite(n) ? Math.round(roundMoney(n) * 100) : 0;
}

/** Dollars from whole cents. */
export function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Sum dollar amounts without floating-point drift by adding in integer cents.
 * `[212.08, 320.38, 332.91]` returns exactly 865.37, where a plain reduce
 * returns 865.3700000000001.
 */
export function sumMoney(values: number[]): number {
  return fromCents(values.reduce((acc, v) => acc + toCents(v), 0));
}

/* ── growth ──────────────────────────────────────────────────────────────── */

/**
 * Year fraction between two ISO dates (ACT/365.25). Negative if `end`
 * precedes `start`; null if either date is unparseable.
 */
export function yearsBetween(startISO: string, endISO: string): number | null {
  const a = Date.parse(startISO);
  const b = Date.parse(endISO);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (b - a) / MS_PER_DAY / DAYS_PER_YEAR;
}

/**
 * Compound annual growth rate, as a percentage.
 *
 *     CAGR = ((end / start) ^ (1 / years) − 1) × 100
 *
 * Returns null when undefined: a non-positive start (no base to grow from),
 * a non-positive span, or a negative end value. A portfolio that goes to
 * exactly zero is −100%, which is meaningful and is returned.
 */
export function cagr(startValue: number, endValue: number, years: number): number | null {
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue) || !Number.isFinite(years)) return null;
  if (startValue <= 0 || years <= 0 || endValue < 0) return null;
  if (endValue === 0) return -100;
  // A large ratio raised over a very short span overflows to Infinity even
  // though every input was finite and in range (1e12 from 1e-9 across a day).
  // Report that as undefined rather than handing back a non-finite "rate".
  const rate = (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
  return Number.isFinite(rate) ? rate : null;
}

/** CAGR between two dated observations. Null if the dates are bad or non-advancing. */
export function cagrBetween(
  start: { date: string; value: number },
  end: { date: string; value: number },
): number | null {
  const years = yearsBetween(start.date, end.date);
  if (years === null) return null;
  return cagr(start.value, end.value, years);
}

/* ── return ──────────────────────────────────────────────────────────────── */

export interface TotalReturnInput {
  /** Market value at the start of the period. */
  startValue: number;
  /** Market value at the end of the period. */
  endValue: number;
  /** Cash added during the period (deposits, RSU vests landing in the account). */
  contributions?: number;
  /** Cash removed during the period. */
  withdrawals?: number;
  /** Dividends and interest received, whether reinvested or taken as cash. */
  income?: number;
}

export interface TotalReturnResult {
  /** endValue + withdrawals + income − startValue − contributions. */
  gain: number;
  /** Gain as a percentage of the capital at risk, or null if there was none. */
  pct: number | null;
  /** The denominator used: startValue + contributions. */
  basis: number;
  /** The portion of `gain` attributable to income rather than price. */
  incomeGain: number;
  /** The portion attributable to price movement. */
  priceGain: number;
}

/**
 * Total return over a period, including income and adjusted for external cash
 * flows so a deposit is never mistaken for a gain.
 *
 * This is a simple money-weighted return: contributions are treated as
 * present for the whole period. It is NOT time-weighted (TWR) and NOT an IRR,
 * so a large late-period deposit will understate the percentage. For a
 * single-user tracker with occasional flows that is the honest, legible
 * approximation; anything else needs dated cash flows.
 */
export function totalReturn(input: TotalReturnInput): TotalReturnResult {
  const startValue = finite(input.startValue);
  const endValue = finite(input.endValue);
  const contributions = finite(input.contributions);
  const withdrawals = finite(input.withdrawals);
  const income = finite(input.income);

  const basis = startValue + contributions;
  const gain = endValue + withdrawals + income - startValue - contributions;
  const priceGain = gain - income;

  return {
    gain,
    basis,
    pct: basis > 0 ? (gain / basis) * 100 : null,
    incomeGain: income,
    priceGain,
  };
}

/** Simple price return with no flows: (end − start) / start × 100. */
export function simpleReturn(startValue: number, endValue: number): number | null {
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) return null;
  if (startValue <= 0) return null;
  return ((endValue - startValue) / startValue) * 100;
}

/* ── yield ───────────────────────────────────────────────────────────────── */

/**
 * Current dividend yield: annual income as a percentage of market value.
 * Null when there is no value to divide by.
 */
export function dividendYield(annualIncome: number, marketValue: number): number | null {
  if (!Number.isFinite(annualIncome) || !Number.isFinite(marketValue)) return null;
  if (marketValue <= 0) return null;
  return (annualIncome / marketValue) * 100;
}

/**
 * Yield on cost: annual income against what was actually paid, not today's
 * price. Rises over time for a held position whose dividend grows.
 */
export function yieldOnCost(annualIncome: number, costBasis: number): number | null {
  if (!Number.isFinite(annualIncome) || !Number.isFinite(costBasis)) return null;
  if (costBasis <= 0) return null;
  return (annualIncome / costBasis) * 100;
}

export interface YieldPosition {
  symbol: string;
  marketValue: number;
  /** Expected income over the next twelve months. */
  annualIncome: number;
}

export interface PortfolioYieldResult {
  /** Summed annual income across positions. */
  totalIncome: number;
  /** Summed market value across positions. */
  totalValue: number;
  /** Value-weighted yield, or null when there is no value. */
  pct: number | null;
  /** Income expressed monthly, for planning. */
  monthlyIncome: number;
}

/**
 * Portfolio dividend yield. Value-weighted by construction — summing income
 * and dividing by summed value gives each position weight in proportion to
 * its size, which is what "the portfolio yields X%" means. Averaging the
 * per-position yields instead would weight a $50 position like a $50,000 one.
 */
export function portfolioYield(positions: YieldPosition[]): PortfolioYieldResult {
  const totalIncome = sumMoney(positions.map((p) => finite(p.annualIncome)));
  const totalValue = sumMoney(positions.map((p) => finite(p.marketValue)));
  return {
    totalIncome,
    totalValue,
    pct: totalValue > 0 ? (totalIncome / totalValue) * 100 : null,
    monthlyIncome: roundMoney(totalIncome / 12),
  };
}

const finite = (v: number | undefined | null): number => (Number.isFinite(v) ? (v as number) : 0);
