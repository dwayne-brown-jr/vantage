import type { AssetClassKey, Bucket } from "@/lib/types";

export interface AssetClassMeta {
  label: string;
  color: string;
  bucket: Bucket;
}

/**
 * The asset-class taxonomy. Labels are CLIENT-FACING copy — plain English a
 * non-specialist would use out loud; every calculation keys off the
 * AssetClassKey code, never the label, so these are safe to reword.
 *
 * Ported from the prototype. `bucket` maps
 * each display class into the high-level US / International / Blend / Cash view.
 * `tdf` is special-cased in analytics: it is decomposed via TDF_SPLIT rather
 * than dropped whole into its bucket.
 */
export const ASSET_CLASSES: Record<AssetClassKey, AssetClassMeta> = {
  us_large: { label: "US large companies", color: "#e0b544", bucket: "US equity" },
  us_total: { label: "US whole market", color: "#c9a04d", bucket: "US equity" },
  us_stock: { label: "Individual stocks", color: "#d96b6b", bucket: "US equity" },
  intl_dev: { label: "International", color: "#7fa0c8", bucket: "International" },
  intl_em: { label: "Emerging markets", color: "#9dbadd", bucket: "International" },
  div_value: { label: "Dividend payers", color: "#6fb891", bucket: "US equity" },
  sector: { label: "Industry funds", color: "#ad8cc2", bucket: "US equity" },
  spec: { label: "High-risk holdings", color: "#e89b6c", bucket: "US equity" },
  tdf: { label: "Target-date fund", color: "#8b9fb6", bucket: "Blend" },
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
