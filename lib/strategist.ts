import { analyze } from "@/lib/analytics";
import { ASSET_CLASSES } from "@/lib/constants";
import { fmtPct, fmtUSD } from "@/lib/format";
import type { Holding } from "@/lib/types";

/**
 * The strategist's persona. Built server-side; the LLM narrates over the
 * computed figures and never does arithmetic itself.
 */
export const STRATEGIST_SYSTEM =
  "You are a candid personal portfolio strategist embedded in the owner's private dashboard. " +
  "You have their real portfolio below. Give concise, direct, honest analysis and trade-offs in plain prose " +
  "(no markdown headers, no bullet dumps). Lead with the answer. Use ONLY the figures provided — never invent or " +
  "estimate numbers that aren't given. When the question is about current events, news, or live prices, use web " +
  "search and cite what you find. Keep it tight: a few short paragraphs at most. This is educational information, " +
  "not licensed investment, tax, or legal advice.";

/**
 * Build the portfolio snapshot the strategist reasons over. Computed from the
 * deterministic analytics engine — the only source of numbers.
 */
export function buildStrategistContext(holdings: Holding[]): string {
  const a = analyze(holdings);

  const lines = holdings
    .filter((h) => h.assetClass !== "cash")
    .slice()
    .sort((x, y) => y.value - x.value)
    .map((h) => `${h.symbol} (${h.account.split(" · ")[0]}) ${fmtUSD(h.value)} — ${ASSET_CLASSES[h.assetClass].label}`)
    .join("\n");

  return [
    "PORTFOLIO SNAPSHOT (the owner's real holdings; use only these figures, never invent numbers):",
    `Total invested: ${fmtUSD(a.total)} across ${a.byAccount.length} accounts.`,
    `High-level mix: US equity ${fmtPct(a.usEquityPct)}, International ${fmtPct(a.intlPct)}, Bonds ${fmtPct(
      a.bondPct,
    )}, Cash ${fmtPct(a.cashPct)}.`,
    `Tesla single-stock exposure: ${a.tsla ? fmtUSD(a.tsla.value) : "$0"} = ${
      a.tsla ? fmtPct(a.tsla.pct) : "0%"
    } of the portfolio — and the owner also WORKS at Tesla (salary, benefits, RSUs all Tesla).`,
    `All direct single stocks: ${a.singles.map((s) => `${s.symbol} ${fmtPct(s.pct)}`).join(", ")}.`,
    `Unrealized profit: ${fmtUSD(a.unrealized)} (ROI ${fmtPct(a.roi)}) on ${fmtUSD(a.invested)} invested.`,
    `Accounts: ${a.byAccount.map((x) => `${x.account.split(" · ").pop()} ${fmtUSD(x.value)}`).join("; ")}.`,
    "Note: the Roth is tax-free to rebalance; the taxable account holds SWPPX the owner won't sell.",
    "",
    "Holdings:",
    lines,
  ].join("\n");
}
