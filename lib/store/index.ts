import type { HoldingStore } from "@/lib/store/types";

/**
 * Selects the persistence backend:
 *  - Netlify (production) → Netlify Blobs
 *  - everywhere else (local dev/tests) → SQLite
 * Override with VANTAGE_STORE = "blobs" | "sqlite".
 *
 * The chosen backend is imported dynamically so the unused one (and, for
 * SQLite, its native dependency) never enters the other environment's bundle.
 */
let cached: Promise<HoldingStore> | null = null;

function resolveStore(): Promise<HoldingStore> {
  const forced = process.env.VANTAGE_STORE;
  const useBlobs = forced === "blobs" || (!!process.env.NETLIFY && forced !== "sqlite");
  return useBlobs
    ? import("@/lib/store/blobs").then((m) => m.blobsStore)
    : import("@/lib/store/sqlite").then((m) => m.sqliteStore);
}

export function getStore(): Promise<HoldingStore> {
  return (cached ??= resolveStore());
}
