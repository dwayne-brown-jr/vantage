import { classifyAccount, type AccountTax } from "@/lib/accounts";
import { analyze, targetGaps } from "@/lib/analytics";
import { ASSET_CLASSES, COMFORT_CEILING, DEFAULT_TARGETS } from "@/lib/constants";
import { fmtPct, fmtSignedPct, fmtSignedUSD, fmtUSD } from "@/lib/format";
import type { AssetClassKey, Holding } from "@/lib/types";

/**
 * The strategist's persona. Built server-side; the LLM narrates and *plans* over
 * the computed figures and never does arithmetic itself. It may now use light
 * markdown structure (tables, short sections) when the question calls for it —
 * the chat renders markdown.
 */
export const STRATEGIST_SYSTEM = [
  "You are a candid, precise personal portfolio strategist embedded in the owner's private dashboard.",
  "You have their complete, real, per-account holdings below — values, cost basis, unrealized gains, asset class, and the tax treatment of every account.",
  "",
  "RULES:",
  "• Lead with the answer. No preamble, no fluff, no hedging filler.",
  "• Use ONLY the figures provided. Never invent, estimate, or recompute numbers that aren't given. Every dollar figure you cite must appear in the data below.",
  "• Be specific to the ACCOUNT. When you suggest selling or buying, always name the exact account and say why that account (tax treatment, what it already holds).",
  "• Prefer tax-free moves: rebalancing inside the Roth and 401(k) is tax-free; selling in the taxable account realizes capital-gains tax on the GAIN portion only. A position with a small gain is cheap to trim; a large-gain position is expensive.",
  "• Respect the owner's constraints: the taxable SWPPX is a hold (don't sell it); Tesla is also the owner's employer, so true Tesla exposure exceeds the TSLA line.",
  "• This is educational information, not licensed investment, tax, or legal advice.",
  "",
  "FORMATTING:",
  "• For a quick question, answer in 1–3 tight paragraphs of plain prose.",
  "• For a PLAN, comparison, or anything with multiple moves, use markdown structure: a one-line bottom line first, then a **Sell** table and a **Reinvest** table where relevant.",
  "  Sell table columns: Account | Sell | Amount | Why. Reinvest table columns: Account | Buy | Amount | Why.",
  "  Keep 'Why' to a short phrase. End with a one-line bottom line and any caution (trading windows, taxes).",
  "• When the question is about current events, news, or live prices, use web search and cite what you find.",
].join("\n");

/* ── structured ledger (shared by chat + plan) ───────────────────────────── */
export interface LedgerHolding {
  account: string;
  accountTax: AccountTax;
  symbol: string;
  name: string;
  value: number;
  costBasis: number;
  /** value − costBasis. */
  unrealized: number;
  /** Gain as a percentage of cost basis (0 when basis unknown). */
  gainPct: number;
  assetClass: AssetClassKey;
}

export interface LedgerAccount {
  account: string;
  tax: AccountTax;
  value: number;
  holdings: LedgerHolding[];
}

export interface Ledger {
  total: number;
  accounts: LedgerAccount[];
}

/** Build the per-account ledger from raw holdings. Deterministic. */
export function buildLedger(holdings: Holding[]): Ledger {
  const byAccount = new Map<string, LedgerHolding[]>();

  for (const h of holdings) {
    const costBasis = Number.isFinite(h.costBasis) ? h.costBasis : 0;
    const unrealized = h.value - costBasis;
    const row: LedgerHolding = {
      account: h.account,
      accountTax: classifyAccount(h.account),
      symbol: h.symbol,
      name: h.name,
      value: h.value,
      costBasis,
      unrealized,
      gainPct: costBasis > 0 ? (unrealized / costBasis) * 100 : 0,
      assetClass: h.assetClass,
    };
    const list = byAccount.get(h.account) ?? [];
    list.push(row);
    byAccount.set(h.account, list);
  }

  const accounts: LedgerAccount[] = [...byAccount.entries()]
    .map(([account, list]) => ({
      account,
      tax: classifyAccount(account),
      value: list.reduce((s, r) => s + r.value, 0),
      holdings: list.slice().sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);

  return { total: accounts.reduce((s, x) => s + x.value, 0), accounts };
}

/**
 * Build the portfolio context the strategist reasons over — a complete,
 * precise, per-account ledger plus the headline analytics. The only source of
 * numbers; the LLM narrates over it and never does arithmetic.
 */
export function buildStrategistContext(holdings: Holding[]): string {
  const a = analyze(holdings);
  const ledger = buildLedger(holdings);
  const gaps = targetGaps(a.buckets, DEFAULT_TARGETS, a.total);

  // Cash available to deploy without selling anything.
  const cashByAccount = holdings
    .filter((h) => h.assetClass === "cash")
    .map((h) => `${classifyAccount(h.account).label} ${fmtUSD(h.value)}`);

  const gapLines = gaps
    .filter((g) => !g.onTarget)
    .map(
      (g) =>
        `  ${g.label}: ${fmtPct(g.actualPct)} now vs ${g.targetPct}% target → ${
          g.deltaDollar >= 0 ? `add ${fmtUSD(g.deltaDollar)}` : `trim ${fmtUSD(-g.deltaDollar)}`
        }`,
    );

  const accountBlocks = ledger.accounts.map((acc) => {
    const head = `[${acc.account}] — ${acc.tax.note} (account total ${fmtUSD(acc.value)})`;
    const rows = acc.holdings.map((h) => {
      const cls = ASSET_CLASSES[h.assetClass].label;
      const basis = h.costBasis > 0 ? `basis ${fmtUSD(h.costBasis)}` : "basis n/a";
      const pl =
        h.costBasis > 0 ? `${fmtSignedUSD(h.unrealized)} (${fmtSignedPct(h.gainPct)})` : "—";
      const hold = h.account.toLowerCase().includes("taxable") && h.symbol === "SWPPX" ? "  [HOLD — do not sell]" : "";
      return `  ${h.symbol.padEnd(7)} ${fmtUSD(h.value).padStart(8)}  ${basis.padEnd(14)} ${pl.padEnd(20)} ${cls}${hold}`;
    });
    return [head, ...rows].join("\n");
  });

  return [
    "PORTFOLIO LEDGER — the owner's complete real holdings. Use ONLY these figures; never invent or recompute numbers.",
    `Total invested: ${fmtUSD(a.total)} across ${a.byAccount.length} accounts. Unrealized P/L: ${fmtSignedUSD(
      a.unrealized,
    )} (ROI ${fmtPct(a.roi)}) on ${fmtUSD(a.invested)} invested.`,
    "",
    `High-level mix: US equity ${fmtPct(a.usEquityPct)}, International ${fmtPct(a.intlPct)}, Bonds ${fmtPct(
      a.bondPct,
    )}, Cash ${fmtPct(a.cashPct)}. (The 2060 target-date fund's intl & bond sleeves are already counted here.)`,
    `Targets (editable defaults): US equity ${DEFAULT_TARGETS["US equity"]}%, International ${DEFAULT_TARGETS.International}%, Bonds ${DEFAULT_TARGETS.Bonds}%, Cash ${DEFAULT_TARGETS.Cash}%.`,
    gapLines.length ? "Gaps to close:\n" + gapLines.join("\n") : "Allocation is within ~1% of every target.",
    "",
    `Concentration: direct single stocks total ${fmtUSD(a.singleTotal)} (${fmtPct(
      pctOfTotal(a.singleTotal, a.total),
    )}). Per-stock: ${a.singles.map((s) => `${s.symbol} ${fmtPct(s.pct)}`).join(", ")}.`,
    `Tesla: TSLA line is ${a.tsla ? `${fmtUSD(a.tsla.value)} = ${fmtPct(a.tsla.pct)}` : "$0"} of the portfolio, BUT the owner also WORKS at Tesla (salary, benefits, and future RSUs are all Tesla), so true Tesla exposure is materially higher. Comfort ceiling for any single stock: ${COMFORT_CEILING}%.`,
    cashByAccount.length ? `Cash available to deploy without selling: ${fmtUSD(a.cashTotal)} (${cashByAccount.join(", ")}).` : "",
    "",
    "TAX RULE (applies to every suggestion): In the Roth and the 401(k), selling to rebalance is TAX-FREE. In the taxable account, only the GAIN portion of a sale is taxed (~18.8% long-term + any state) — so a low-gain holding is cheap to trim and a high-gain holding is expensive. RSUs are taxed as ordinary income at vest.",
    "",
    "HOLDINGS BY ACCOUNT (symbol | market value | cost basis | unrealized $ (%) | class):",
    accountBlocks.join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n");
}

const pctOfTotal = (value: number, total: number): number => (total > 0 ? (value / total) * 100 : 0);
