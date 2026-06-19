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
  us_large: { label: "US large-cap index", color: "#CDA434", bucket: "US equity" },
  us_total: { label: "US total market", color: "#B08A3E", bucket: "US equity" },
  us_stock: { label: "US single stocks", color: "#C75D5D", bucket: "US equity" },
  intl_dev: { label: "International developed", color: "#6E8BB0", bucket: "International" },
  intl_em: { label: "Emerging markets", color: "#86A6CC", bucket: "International" },
  div_value: { label: "Dividend / value", color: "#5FA37E", bucket: "US equity" },
  sector: { label: "Sector bets", color: "#9C7BB0", bucket: "US equity" },
  spec: { label: "Speculative", color: "#D98C5F", bucket: "US equity" },
  tdf: { label: "Target-date blend", color: "#7A8FA6", bucket: "Blend" },
  cash: { label: "Cash", color: "#4A515C", bucket: "Cash" },
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
  "US equity": "#CDA434",
  International: "#6E8BB0",
  Bonds: "#7A8FA6",
  Cash: "#4A515C",
} as const;
