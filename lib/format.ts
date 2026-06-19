/** Presentation helpers (UI only — analytics never formats, it returns numbers). */

/** "$1,234" — whole-dollar, thousands-separated. */
export const fmtUSD = (n: number): string => "$" + Math.round(n).toLocaleString("en-US");

/** "32.2%" — one decimal place. */
export const fmtPct = (n: number): string => n.toFixed(1) + "%";

/** "+$1,234" / "−$1,234" — signed whole dollars (true minus sign). */
export const fmtSignedUSD = (n: number): string =>
  (n >= 0 ? "+" : "−") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");

/** "+32.2%" / "−32.2%" — signed percentage (true minus sign). */
export const fmtSignedPct = (n: number): string =>
  (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(1) + "%";
