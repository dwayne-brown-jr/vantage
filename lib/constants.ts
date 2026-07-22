import type { AssetClassKey, Bucket } from "@/lib/types";

export interface AssetClassMeta {
  label: string;
  color: string;
  bucket: Bucket;
}

/**
 * The asset-class taxonomy, ported verbatim from the prototype. `bucket` maps
 * each display class into the high-level US / International / Blend / Cash view.
 * `tdf` is special-cased in analytics: it is decomposed via TDF_SPLIT rather
 * than dropped whole into its bucket.
 */
export const ASSET_CLASSES: Record<AssetClassKey, AssetClassMeta> = {
  us_large: { label: "US large-cap index", color: "#e0b544", bucket: "US equity" },
  us_total: { label: "US total market", color: "#c9a04d", bucket: "US equity" },
  us_stock: { label: "US single stocks", color: "#d96b6b", bucket: "US equity" },
  intl_dev: { label: "International developed", color: "#7fa0c8", bucket: "International" },
  intl_em: { label: "Emerging markets", color: "#9dbadd", bucket: "International" },
  div_value: { label: "Dividend / value", color: "#6fb891", bucket: "US equity" },
  sector: { label: "Sector bets", color: "#ad8cc2", bucket: "US equity" },
  spec: { label: "Speculative", color: "#e89b6c", bucket: "US equity" },
  tdf: { label: "Target-date blend", color: "#8b9fb6", bucket: "Blend" },
  cash: { label: "Cash", color: "#5c6472", bucket: "Cash" },
};

export const ASSET_CLASS_KEYS = Object.keys(ASSET_CLASSES) as AssetClassKey[];

/** Approximate internal split of the 2060 target-date fund (us / intl / bond). */
export const TDF_SPLIT = { us: 0.63, intl: 0.3, bond: 0.07 } as const;

/** Single-stock comfort ceiling, as a percentage of the whole portfolio. */
export const COMFORT_CEILING = 15;

/** Default Plan targets (age-appropriate, globally diversified, equity-heavy). */
export const DEFAULT_TARGETS: Record<string, number> = {
  "US equity": 60,
  International: 28,
  Bonds: 8,
  Cash: 4,
};

/** Bucket display colors, kept alongside the taxonomy for chart parity. */
export const BUCKET_COLORS = {
  "US equity": "#e0b544",
  International: "#7fa0c8",
  Bonds: "#8b9fb6",
  Cash: "#5c6472",
} as const;
