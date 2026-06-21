import { describe, expect, it } from "vitest";

import { buildSnapshot, upsertByDay, type Snapshot } from "@/lib/snapshots";
import { SEED_HOLDINGS } from "@/lib/seed";

describe("buildSnapshot()", () => {
  it("captures the key portfolio figures from analyze()", () => {
    const s = buildSnapshot(SEED_HOLDINGS, "2026-06-19T16:30:00.000Z", "s1");
    expect(s.day).toBe("2026-06-19");
    expect(s.total).toBeCloseTo(93_183.51, 2);
    expect(s.tslaPct).toBeCloseTo(32.2, 1);
    expect(s.tslaValue).toBe(30_000);
    expect(s.usEquityPct).toBeCloseTo(91.8, 1);
  });
});

describe("upsertByDay()", () => {
  const mk = (day: string, at: string, total: number): Snapshot => ({
    id: at,
    at,
    day,
    total,
    tslaValue: 0,
    tslaPct: 0,
    usEquityPct: 0,
    intlPct: 0,
    bondPct: 0,
    cashPct: 0,
    invested: 0,
    unrealized: 0,
  });

  it("replaces an existing same-day snapshot and keeps order", () => {
    const start = [mk("2026-06-18", "2026-06-18T10:00:00Z", 100), mk("2026-06-19", "2026-06-19T10:00:00Z", 200)];
    const next = upsertByDay(start, mk("2026-06-19", "2026-06-19T20:00:00Z", 250));
    expect(next).toHaveLength(2);
    expect(next[1]!.total).toBe(250); // replaced
    expect(next.map((s) => s.day)).toEqual(["2026-06-18", "2026-06-19"]); // sorted
  });

  it("appends a new day", () => {
    const next = upsertByDay([mk("2026-06-18", "2026-06-18T10:00:00Z", 100)], mk("2026-06-20", "2026-06-20T10:00:00Z", 300));
    expect(next.map((s) => s.day)).toEqual(["2026-06-18", "2026-06-20"]);
  });
});
