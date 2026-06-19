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
