import type { MergeImportResult } from "@/lib/store/shared";
import type { Snapshot } from "@/lib/snapshots";
import type { Holding, HoldingInput } from "@/lib/types";

/**
 * Backend-agnostic holdings store. Implemented by SQLite (local) and Netlify
 * Blobs (production). All methods are async so the two backends share one shape.
 */
export interface HoldingStore {
  list(): Promise<Holding[]>;
  create(input: HoldingInput): Promise<Holding>;
  update(id: string, patch: Partial<HoldingInput>): Promise<Holding | null>;
  remove(id: string): Promise<boolean>;
  /**
   * Import a batch, upserting by (account, symbol): existing positions are
   * refreshed, genuinely new ones are added. Returns the full holdings set plus
   * how many were created vs updated.
   */
  bulkUpsert(inputs: HoldingInput[]): Promise<MergeImportResult>;
  /** Replace the entire set of holdings (used by price refresh). */
  replaceAll(holdings: Holding[]): Promise<Holding[]>;

  /** Portfolio snapshots, oldest→newest. */
  listSnapshots(): Promise<Snapshot[]>;
  /** Record a snapshot, replacing any existing one for the same calendar day. */
  recordSnapshot(snapshot: Snapshot): Promise<void>;
}
