import { getDataSource } from "@/lib/datasource";
import { repriceHoldings, type RepriceResult } from "@/lib/prices";
import { listHoldings, recordCurrentSnapshot, replaceAllHoldings } from "@/lib/repository";
import type { Snapshot } from "@/lib/snapshots";

export interface RefreshResult extends RepriceResult {
  snapshot: Snapshot | null;
  asOf: string;
}

/**
 * Fetch quotes, reprice holdings, persist, and capture a daily snapshot. Shared
 * by the interactive price refresh (/api/prices) and the scheduled daily job
 * (/api/cron/snapshot). Throws if the quote provider is unreachable.
 */
export async function refreshAndSnapshot(estimateShares: boolean): Promise<RefreshResult> {
  const holdings = await listHoldings();
  const symbols = [...new Set(holdings.filter((h) => h.assetClass !== "cash").map((h) => h.symbol.toUpperCase()))];
  const quotes = await getDataSource().fetchQuotes(symbols);

  const result = repriceHoldings(holdings, quotes, { estimateShares });
  await replaceAllHoldings(result.holdings);

  let snapshot: Snapshot | null = null;
  try {
    snapshot = await recordCurrentSnapshot();
  } catch {
    // Snapshot failure must not break a refresh.
  }

  return { ...result, snapshot, asOf: new Date().toISOString() };
}
