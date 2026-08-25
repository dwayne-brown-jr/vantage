/**
 * Vantage analytics engine — deterministic, pure, typed.
 *
 * THIS IS THE ONLY PLACE NUMBERS ARE COMPUTED. The LLM strategist narrates over
 * the results of these functions; it never does arithmetic. Ported from the
 * prototype's analyze() + Plan-tab math, with the same semantics.
 */
import type { AssetClassKey, Bucket, Holding } from "@/lib/types";
import { ASSET_CLASSES, BUCKET_COLORS, TDF_SPLIT } from "@/lib/constants";

/* ── helpers ─────────────────────────────────────────────────────────────── */
const num = (v: number | null | undefined): number => (Number.isFinite(v) ? (v as number) : 0);
const pctOf = (value: number, total: number): number => (total > 0 ? (value / total) * 100 : 0);

/* ── result shapes ───────────────────────────────────────────────────────── */
export interface ClassSlice {
  key: AssetClassKey;
  label: string;
  color: string;
  value: number;
  pct: number;
}

export interface BucketSlice {
  /** Display label: "US equity" | "International" | "Bonds" | "Cash". */
  label: string;
  value: number;
  color: string;
  pct: number;
}

export interface SingleStock {
  symbol: string;
  value: number;
  pct: number;
}

export interface AccountSlice {
  account: string;
  value: number;
  pct: number;
}

export interface SymbolAggregate {
  symbol: string;
  name: string;
  assetClass: AssetClassKey;
  color: string;
  value: number;
  costBasis: number;
  unrealized: number;
  roi: number;
}

export interface PortfolioAnalysis {
  total: number;

  byClass: ClassSlice[];

  /** Always ordered [US equity, International, Bonds, Cash]. */
  buckets: BucketSlice[];
  usEquity: number;
  usEquityPct: number;
  intl: number;
  intlPct: number;
  bond: number;
  bondPct: number;
  cash: number;
  cashPct: number;

  singles: SingleStock[];
  singleTotal: number;
  tsla: SingleStock | null;

  byAccount: AccountSlice[];

  /** Cost basis excluding cash. */
  invested: number;
  /** Market value excluding cash. */
  investedValue: number;
  /** investedValue − invested. */
  unrealized: number;
  /** Return on invested cost, as a percentage. */
  roi: number;
  cashTotal: number;

  /** Per-symbol aggregates across accounts (non-cash), largest first. */
  symbols: SymbolAggregate[];

  /** Value − basis across holdings where a basis is known. */
  gain: number;
  basis: number;

  /** Total market value of speculative satellites. */
  specTotal: number;

  /**
   * Unvested equity comp across all holdings. NOT included in `total` or in
   * any percentage — it isn't owned yet. Surfaced so the exposure it creates
   * stays visible.
   */
  unvestedTotal: number;
  /** Unvested value attached to TSLA specifically. */
  tslaUnvested: number;
  /**
   * Tesla exposure counting unvested RSUs, as a percentage of the portfolio
   * plus that unvested value. This is the honest concentration figure for
   * someone whose employer is also their largest position: the vested
   * percentage alone understates how much of their financial future rides on
   * one company.
   */
  tslaExposurePct: number;
}

/* ── core ────────────────────────────────────────────────────────────────── */
export function analyze(holdings: Holding[]): PortfolioAnalysis {
  const total = holdings.reduce((s, h) => s + num(h.value), 0);

  // By display class.
  const clsMap = new Map<AssetClassKey, number>();
  for (const h of holdings) clsMap.set(h.assetClass, (clsMap.get(h.assetClass) ?? 0) + num(h.value));
  const byClass: ClassSlice[] = [...clsMap.entries()]
    .map(([key, value]) => ({
      key,
      value,
      label: ASSET_CLASSES[key].label,
      color: ASSET_CLASSES[key].color,
      pct: pctOf(value, total),
    }))
    .sort((a, b) => b.value - a.value);

  // High-level buckets, decomposing the target-date fund via TDF_SPLIT.
  let usEquity = 0;
  let intl = 0;
  let bond = 0;
  let cash = 0;
  for (const h of holdings) {
    const v = num(h.value);
    if (h.assetClass === "tdf") {
      usEquity += v * TDF_SPLIT.us;
      intl += v * TDF_SPLIT.intl;
      bond += v * TDF_SPLIT.bond;
    } else {
      const bucket: Bucket = ASSET_CLASSES[h.assetClass].bucket;
      if (bucket === "US equity") usEquity += v;
      else if (bucket === "International") intl += v;
      else if (bucket === "Cash") cash += v;
    }
  }
  const buckets: BucketSlice[] = [
    { label: "US equity", value: usEquity, color: BUCKET_COLORS["US equity"] },
    { label: "International", value: intl, color: BUCKET_COLORS.International },
    { label: "Bonds", value: bond, color: BUCKET_COLORS.Bonds },
    { label: "Cash", value: cash, color: BUCKET_COLORS.Cash },
  ].map((b) => ({ ...b, pct: pctOf(b.value, total) }));

  // Single-stock concentration (direct US single stocks only).
  const stockMap = new Map<string, number>();
  for (const h of holdings) {
    if (h.assetClass === "us_stock") stockMap.set(h.symbol, (stockMap.get(h.symbol) ?? 0) + num(h.value));
  }
  const singles: SingleStock[] = [...stockMap.entries()]
    .map(([symbol, value]) => ({ symbol, value, pct: pctOf(value, total) }))
    .sort((a, b) => b.value - a.value);
  const singleTotal = singles.reduce((s, x) => s + x.value, 0);
  const tsla = singles.find((s) => s.symbol === "TSLA") ?? null;

  // By account.
  const acctMap = new Map<string, number>();
  for (const h of holdings) acctMap.set(h.account, (acctMap.get(h.account) ?? 0) + num(h.value));
  const byAccount: AccountSlice[] = [...acctMap.entries()]
    .map(([account, value]) => ({ account, value, pct: pctOf(value, total) }))
    .sort((a, b) => b.value - a.value);

  // Performance over non-cash holdings (cash has no basis).
  const nonCash = holdings.filter((h) => h.assetClass !== "cash");
  const invested = nonCash.reduce((s, h) => s + num(h.costBasis), 0);
  const investedValue = nonCash.reduce((s, h) => s + num(h.value), 0);
  const unrealized = investedValue - invested;
  const roi = invested > 0 ? (unrealized / invested) * 100 : 0;
  const cashTotal = holdings.filter((h) => h.assetClass === "cash").reduce((s, h) => s + num(h.value), 0);

  // Per-symbol aggregates across accounts (for charts + tables).
  const symMap = new Map<string, SymbolAggregate>();
  for (const h of nonCash) {
    const existing = symMap.get(h.symbol);
    if (existing) {
      existing.value += num(h.value);
      existing.costBasis += num(h.costBasis);
    } else {
      symMap.set(h.symbol, {
        symbol: h.symbol,
        name: h.name,
        assetClass: h.assetClass,
        color: ASSET_CLASSES[h.assetClass].color,
        value: num(h.value),
        costBasis: num(h.costBasis),
        unrealized: 0,
        roi: 0,
      });
    }
  }
  const symbols: SymbolAggregate[] = [...symMap.values()]
    .map((s) => ({
      ...s,
      unrealized: s.value - s.costBasis,
      roi: s.costBasis > 0 ? ((s.value - s.costBasis) / s.costBasis) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // Gains where a basis is known.
  const withBasis = holdings.filter((h) => num(h.costBasis) > 0);
  const basis = withBasis.reduce((s, h) => s + num(h.costBasis), 0);
  const valueWithBasis = withBasis.reduce((s, h) => s + num(h.value), 0);
  const gain = valueWithBasis - basis;

  const specTotal = holdings.filter((h) => h.assetClass === "spec").reduce((s, h) => s + num(h.value), 0);

  // Unvested equity comp — tracked alongside, never added into `total`.
  const unvestedTotal = holdings.reduce((s, h) => s + num(h.unvested), 0);
  const tslaUnvested = holdings
    .filter((h) => h.symbol.toUpperCase() === "TSLA")
    .reduce((s, h) => s + num(h.unvested), 0);
  const exposureBase = total + tslaUnvested;
  const tslaExposurePct = pctOf((tsla?.value ?? 0) + tslaUnvested, exposureBase);

  return {
    total,
    byClass,
    buckets,
    usEquity,
    usEquityPct: pctOf(usEquity, total),
    intl,
    intlPct: pctOf(intl, total),
    bond,
    bondPct: pctOf(bond, total),
    cash,
    cashPct: pctOf(cash, total),
    singles,
    singleTotal,
    tsla,
    byAccount,
    invested,
    investedValue,
    unrealized,
    roi,
    cashTotal,
    symbols,
    gain,
    basis,
    specTotal,
    unvestedTotal,
    tslaUnvested,
    tslaExposurePct,
  };
}

/* ── Plan: target vs. actual gaps ────────────────────────────────────────── */
export interface TargetGap {
  label: string;
  actualPct: number;
  targetPct: number;
  /** Dollars to move to hit target: +ve = add, −ve = trim. */
  deltaDollar: number;
  /** Within 1% of total of target. */
  onTarget: boolean;
}

export function targetGaps(
  buckets: BucketSlice[],
  targets: Record<string, number>,
  total: number,
): TargetGap[] {
  return buckets.map((b) => {
    const targetPct = targets[b.label] ?? 0;
    const deltaDollar = ((targetPct - b.pct) / 100) * total;
    return {
      label: b.label,
      actualPct: b.pct,
      targetPct,
      deltaDollar,
      onTarget: Math.abs(deltaDollar) < total * 0.01,
    };
  });
}

/* ── Plan: RSU diversification projection ────────────────────────────────── */
export interface RsuProjectionInput {
  /** Current TSLA single-stock value. */
  startTslaValue: number;
  /** Current portfolio total. */
  startTotal: number;
  /** Dollars of existing TSLA trimmed each quarter. */
  trimPerQuarter: number;
  /** Dollars of RSUs vesting each quarter. */
  vestPerQuarter: number;
  /** If true, vests are sold on landing (proceeds diversified, not held as TSLA). */
  sellVests: boolean;
  /** Target ceiling for TSLA, as a percentage of the portfolio. */
  ceilingPct: number;
  /** Number of quarters to project (default 16 = 4 years). */
  quarters?: number;
}

export interface RsuProjectionPoint {
  quarter: number;
  tslaValue: number;
  total: number;
  pct: number;
}

export interface RsuProjection {
  points: RsuProjectionPoint[];
  /** Quarter at which TSLA first falls to/under the ceiling, or null if never. */
  reachedQuarter: number | null;
  /** Dollars redirected into diversified holdings each quarter. */
  redirectPerQuarter: number;
}

/**
 * Projects TSLA concentration over time. No market prediction: growth would
 * lift numerator and denominator together, so the decline comes purely from
 * trims plus the dilution of selling vests into diversified holdings.
 */
export function projectRsu(input: RsuProjectionInput): RsuProjection {
  const { trimPerQuarter, vestPerQuarter, sellVests, ceilingPct } = input;
  const quarters = input.quarters ?? 16;

  let tslaValue = Math.max(0, input.startTslaValue);
  let total = Math.max(0, input.startTotal);

  const points: RsuProjectionPoint[] = [{ quarter: 0, tslaValue, total, pct: pctOf(tslaValue, total) }];
  let reachedQuarter: number | null = null;

  for (let q = 1; q <= quarters; q++) {
    total = total + vestPerQuarter;
    tslaValue = Math.max(0, tslaValue - trimPerQuarter + (sellVests ? 0 : vestPerQuarter));
    const pct = pctOf(tslaValue, total);
    points.push({ quarter: q, tslaValue, total, pct });
    if (reachedQuarter === null && pct <= ceilingPct) reachedQuarter = q;
  }

  return {
    points,
    reachedQuarter,
    redirectPerQuarter: trimPerQuarter + (sellVests ? vestPerQuarter : 0),
  };
}
