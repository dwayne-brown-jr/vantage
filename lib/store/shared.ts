import type { Holding, HoldingInput } from "@/lib/types";

/** Materialize a HoldingInput into a full Holding, assigning id/timestamp. */
export function materialize(input: HoldingInput): Holding {
  return {
    id: input.id ?? crypto.randomUUID(),
    account: input.account,
    symbol: input.symbol,
    name: input.name ?? "",
    value: input.value,
    costBasis: input.costBasis,
    assetClass: input.assetClass,
    quantity: input.quantity ?? null,
    price: input.price ?? null,
    source: input.source ?? "manual",
    updatedAt: new Date().toISOString(),
  };
}

/** A holding and an incoming import row match when same account + same ticker. */
const samePosition = (h: Holding, input: HoldingInput): boolean =>
  h.account === input.account && h.symbol.trim().toUpperCase() === input.symbol.trim().toUpperCase();

export interface MergeImportResult {
  holdings: Holding[];
  created: number;
  updated: number;
}

/**
 * Merge a batch of imported rows into the existing holdings, matching by
 * (account, symbol) so re-importing the same statement REFRESHES positions
 * instead of duplicating them. On a match, the broker's market fields (value,
 * cost basis, quantity, price) are refreshed but the user's own categorization
 * (asset class) and name are preserved. Pure — the stores supply/persist the
 * arrays around it. Duplicate rows within one import collapse onto the same
 * position.
 */
export function mergeImport(existing: Holding[], inputs: HoldingInput[]): MergeImportResult {
  const holdings = existing.map((h) => ({ ...h }));
  let created = 0;
  let updated = 0;

  for (const input of inputs) {
    const i = holdings.findIndex((h) => samePosition(h, input));
    if (i >= 0) {
      const prev = holdings[i]!;
      holdings[i] = {
        ...prev,
        value: input.value,
        costBasis: input.costBasis,
        quantity: input.quantity ?? prev.quantity ?? null,
        price: input.price ?? prev.price ?? null,
        source: input.source ?? prev.source ?? null,
        updatedAt: new Date().toISOString(),
      };
      updated++;
    } else {
      holdings.push(materialize(input));
      created++;
    }
  }

  return { holdings, created, updated };
}
