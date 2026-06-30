import { randomUUID } from "node:crypto";

import { buildSnapshot, type Snapshot } from "@/lib/snapshots";
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

/** Import a batch, upserting by (account, symbol) — see HoldingStore.bulkUpsert. */
export async function upsertImportedHoldings(inputs: HoldingInput[]) {
  return (await getStore()).bulkUpsert(inputs);
}

export async function replaceAllHoldings(holdings: Holding[]): Promise<Holding[]> {
  return (await getStore()).replaceAll(holdings);
}

export async function listSnapshots(): Promise<Snapshot[]> {
  return (await getStore()).listSnapshots();
}

/** Compute and record a snapshot of the current portfolio (upserted per day). */
export async function recordCurrentSnapshot(): Promise<Snapshot> {
  const store = await getStore();
  const holdings = await store.list();
  const snapshot = buildSnapshot(holdings, new Date().toISOString(), randomUUID());
  await store.recordSnapshot(snapshot);
  return snapshot;
}
