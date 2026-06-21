import { getStore as getBlobStore } from "@netlify/blobs";

import { SEED_HOLDINGS } from "@/lib/seed";
import { upsertByDay, type Snapshot } from "@/lib/snapshots";
import { materialize } from "@/lib/store/shared";
import type { HoldingStore } from "@/lib/store/types";
import type { Holding } from "@/lib/types";

/**
 * Netlify Blobs backend (production). Stores the entire holdings array as a
 * single JSON blob — ample for a single-user portfolio, and it persists across
 * deploys and function invocations (unlike a local file on serverless). On
 * Netlify the store auto-configures; no credentials needed.
 */
const STORE_NAME = "vantage";
const KEY = "holdings";

function blobs() {
  return getBlobStore({ name: STORE_NAME, consistency: "strong" });
}

async function readAll(): Promise<Holding[]> {
  const data = (await blobs().get(KEY, { type: "json" })) as Holding[] | null;
  if (data) return data;
  // First run: seed.
  await blobs().setJSON(KEY, SEED_HOLDINGS);
  return [...SEED_HOLDINGS];
}

async function writeAll(holdings: Holding[]): Promise<void> {
  await blobs().setJSON(KEY, holdings);
}

export const blobsStore: HoldingStore = {
  list: () => readAll(),

  async create(input) {
    const all = await readAll();
    const holding = materialize(input);
    all.push(holding);
    await writeAll(all);
    return holding;
  },

  async update(id, patch) {
    const all = await readAll();
    const i = all.findIndex((h) => h.id === id);
    if (i < 0) return null;
    const updated: Holding = { ...all[i]!, ...patch, id, updatedAt: new Date().toISOString() };
    all[i] = updated;
    await writeAll(all);
    return updated;
  },

  async remove(id) {
    const all = await readAll();
    const next = all.filter((h) => h.id !== id);
    if (next.length === all.length) return false;
    await writeAll(next);
    return true;
  },

  async bulkInsert(inputs) {
    const all = await readAll();
    const created = inputs.map(materialize);
    all.push(...created);
    await writeAll(all);
    return created;
  },

  async replaceAll(holdings) {
    await writeAll(holdings);
    return holdings;
  },

  async listSnapshots() {
    return ((await blobs().get("snapshots", { type: "json" })) as Snapshot[] | null) ?? [];
  },

  async recordSnapshot(snapshot) {
    const all = ((await blobs().get("snapshots", { type: "json" })) as Snapshot[] | null) ?? [];
    await blobs().setJSON("snapshots", upsertByDay(all, snapshot));
  },
};
