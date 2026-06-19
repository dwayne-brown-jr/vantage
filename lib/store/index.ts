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

/**
 * Detect a serverless host (Netlify functions run on AWS Lambda). `NETLIFY`
 * alone isn't reliably present at function runtime, so we check several signals.
 */
function isServerless(): boolean {
  return (
    !!process.env.NETLIFY ||
    !!process.env.NETLIFY_BLOBS_CONTEXT ||
    !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
    !!process.env.LAMBDA_TASK_ROOT
  );
}

function resolveStore(): Promise<HoldingStore> {
  const forced = process.env.VANTAGE_STORE; // "blobs" | "sqlite" | undefined
  const useBlobs = forced === "blobs" || (forced !== "sqlite" && isServerless());
  return useBlobs
    ? import("@/lib/store/blobs").then((m) => m.blobsStore)
    : import("@/lib/store/sqlite").then((m) => m.sqliteStore);
}

export function getStore(): Promise<HoldingStore> {
  return (cached ??= resolveStore());
}
