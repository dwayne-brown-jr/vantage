import { getStore } from "@/lib/store";
import type { Holding, HoldingInput } from "@/lib/types";

/**
 * Public data-access API (server-only). Delegates to the active store backend
 * (SQLite locally, Netlify Blobs in production). Async so both backends share
 * one interface.
 */
export async function listHoldings(): Promise<Holding[]> {
  return (await getStore()).list();
}

export async function createHolding(input: HoldingInput): Promise<Holding> {
  return (await getStore()).create(input);
}

export async function updateHolding(id: string, patch: Partial<HoldingInput>): Promise<Holding | null> {
  return (await getStore()).update(id, patch);
}

export async function deleteHolding(id: string): Promise<boolean> {
  return (await getStore()).remove(id);
}

export async function bulkInsertHoldings(inputs: HoldingInput[]): Promise<Holding[]> {
  return (await getStore()).bulkInsert(inputs);
}

export async function replaceAllHoldings(holdings: Holding[]): Promise<Holding[]> {
  return (await getStore()).replaceAll(holdings);
}
