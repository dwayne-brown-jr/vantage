import { analyze } from "@/lib/analytics";
import type { Holding } from "@/lib/types";

/**
 * A point-in-time record of the portfolio's shape, so progress (especially
 * Tesla concentration coming down) can be charted over time. Derived entirely
 * from the deterministic analytics engine.
 */
export interface Snapshot {
  id: string;
  /** ISO timestamp. */
  at: string;
  /** YYYY-MM-DD (used to keep at most one snapshot per calendar day). */
  day: string;
  total: number;
  tslaValue: number;
  tslaPct: number;
  usEquityPct: number;
  intlPct: number;
  bondPct: number;
  cashPct: number;
  invested: number;
  unrealized: number;
}

export const dayKey = (iso: string): string => iso.slice(0, 10);

export function buildSnapshot(holdings: Holding[], at: string, id: string): Snapshot {
  const a = analyze(holdings);
  return {
    id,
    at,
    day: dayKey(at),
    total: a.total,
    tslaValue: a.tsla?.value ?? 0,
    tslaPct: a.tsla?.pct ?? 0,
    usEquityPct: a.usEquityPct,
    intlPct: a.intlPct,
    bondPct: a.bondPct,
    cashPct: a.cashPct,
    invested: a.invested,
    unrealized: a.unrealized,
  };
}

/** Upsert by calendar day (latest wins), returned sorted oldest→newest. */
export function upsertByDay(snapshots: Snapshot[], snap: Snapshot): Snapshot[] {
  const others = snapshots.filter((s) => s.day !== snap.day);
  return [...others, snap].sort((a, b) => a.at.localeCompare(b.at));
}
