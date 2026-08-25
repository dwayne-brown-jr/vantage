import type { Candle } from "@/lib/datasource";
import type { Reconciliation } from "@/lib/reconcile";
import type { Snapshot } from "@/lib/snapshots";
import type { Technicals } from "@/lib/technicals";
import type { Holding, HoldingInput } from "@/lib/types";

/** Thin typed client for the holdings API (browser-side). */
const JSON_HEADERS = { "Content-Type": "application/json" } as const;

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchHoldings(): Promise<Holding[]> {
  const data = await unwrap<{ holdings: Holding[] }>(await fetch("/api/holdings", { cache: "no-store" }));
  return data.holdings;
}

export async function createHolding(input: HoldingInput): Promise<Holding> {
  const data = await unwrap<{ holding: Holding }>(
    await fetch("/api/holdings", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) }),
  );
  return data.holding;
}

export async function updateHolding(id: string, patch: Partial<HoldingInput>): Promise<Holding> {
  const data = await unwrap<{ holding: Holding }>(
    await fetch(`/api/holdings/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(patch) }),
  );
  return data.holding;
}

export async function deleteHolding(id: string): Promise<void> {
  await unwrap<{ ok: true }>(await fetch(`/api/holdings/${id}`, { method: "DELETE" }));
}

export interface ImportResult {
  /** The full holdings set after the upsert. */
  holdings: Holding[];
  created: number;
  updated: number;
}

export async function importHoldings(holdings: HoldingInput[]): Promise<ImportResult> {
  const data = await unwrap<ImportResult & { count: number }>(
    await fetch("/api/holdings/import", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ holdings }) }),
  );
  return { holdings: data.holdings, created: data.created, updated: data.updated };
}

export interface RefreshPricesResult {
  holdings: Holding[];
  asOf: string;
  priced: string[];
  unresolved: string[];
  valueUpdated: string[];
}

export async function refreshPrices(estimateShares = false): Promise<RefreshPricesResult> {
  return unwrap<RefreshPricesResult>(
    await fetch("/api/prices", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ estimateShares }) }),
  );
}

export async function fetchSnapshots(): Promise<Snapshot[]> {
  const data = await unwrap<{ snapshots: Snapshot[] }>(await fetch("/api/snapshots", { cache: "no-store" }));
  return data.snapshots;
}

export async function saveSnapshot(): Promise<Snapshot[]> {
  const data = await unwrap<{ snapshots: Snapshot[] }>(await fetch("/api/snapshots", { method: "POST" }));
  return data.snapshots;
}

export interface PriceHistory {
  symbol: string;
  candles: Candle[];
  technicals: Technicals | null;
  note?: string;
}

export async function fetchPriceHistory(symbol: string, range: string): Promise<PriceHistory> {
  return unwrap<PriceHistory>(
    await fetch(`/api/history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`, {
      cache: "no-store",
    }),
  );
}

export async function fetchChartInsight(payload: { symbol: string; name?: string; technicals: Technicals }): Promise<string> {
  const data = await unwrap<{ text: string }>(
    await fetch("/api/chart-insight", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(payload) }),
  );
  return data.text;
}

/** Read an attached screenshot/statement and propose ledger corrections. */
export async function reconcileAttachments(
  attachments: unknown[],
  instruction?: string,
): Promise<Reconciliation> {
  const data = await unwrap<{ reconciliation?: Reconciliation; error?: string }>(
    await fetch("/api/strategist/reconcile", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ attachments, instruction }),
    }),
  );
  if (data.error || !data.reconciliation) throw new Error(data.error ?? "Couldn't read that attachment.");
  return data.reconciliation;
}
