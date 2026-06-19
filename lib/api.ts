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

export async function importHoldings(holdings: HoldingInput[]): Promise<Holding[]> {
  const data = await unwrap<{ holdings: Holding[]; count: number }>(
    await fetch("/api/holdings/import", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ holdings }) }),
  );
  return data.holdings;
}
