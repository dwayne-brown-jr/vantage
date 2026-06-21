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
  bulkInsert(inputs: HoldingInput[]): Promise<Holding[]>;
  /** Replace the entire set of holdings (used by price refresh). */
  replaceAll(holdings: Holding[]): Promise<Holding[]>;
}
