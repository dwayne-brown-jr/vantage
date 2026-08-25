import { z } from "zod";

import { ASSET_CLASS_KEYS } from "@/lib/constants";
import type { AssetClassKey } from "@/lib/types";

/** Runtime validation for anything crossing the API boundary. */
export const assetClassSchema = z.enum(ASSET_CLASS_KEYS as [AssetClassKey, ...AssetClassKey[]]);

export const holdingInputSchema = z.object({
  id: z.string().min(1).optional(),
  account: z.string().min(1, "account is required"),
  symbol: z.string().min(1, "symbol is required"),
  name: z.string().default(""),
  value: z.number().finite(),
  costBasis: z.number().finite(),
  assetClass: assetClassSchema,
  quantity: z.number().finite().nullable().optional(),
  price: z.number().finite().nullable().optional(),
  source: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  /** Unvested equity comp — tracked, never counted in portfolio totals. */
  unvested: z.number().finite().nonnegative().nullable().optional(),
});

/**
 * Partial update. `name` is re-declared without its `.default("")`: zod keeps
 * defaults through `.partial()`, so an absent name would be filled in as "" and
 * silently wipe the stored name on every value-only patch.
 */
export const holdingPatchSchema = holdingInputSchema.partial().extend({
  name: z.string().optional(),
});

export const importSchema = z.object({
  holdings: z.array(holdingInputSchema).min(1, "nothing to import").max(2000),
});

export type HoldingInputDTO = z.infer<typeof holdingInputSchema>;
