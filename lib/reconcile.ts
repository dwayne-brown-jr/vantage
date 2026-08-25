/**
 * Ledger reconciliation from an attached screenshot or statement.
 *
 * Division of labour, same as lib/plan.ts: the model READS the document and
 * proposes what it saw (account, symbol, the observed figure); this file does
 * every comparison, resolves proposals against the real ledger, and enforces
 * deterministic guardrails. The model never decides what lands in the database
 * — it can only suggest, and the owner approves each change.
 */
import { ASSET_CLASS_KEYS } from "@/lib/constants";
import type { AssetClassKey, Holding } from "@/lib/types";

/* ── what the model proposes ─────────────────────────────────────────────── */

export type ProposalKind = "update" | "add";
export type Confidence = "high" | "medium" | "low";

export interface ReconcileProposalInput {
  kind: ProposalKind;
  account: string;
  symbol: string;
  /** Display name, used when adding a row the ledger doesn't have. */
  name?: string;
  assetClass?: string;
  /** Observed market value, when the document shows one. */
  value?: number | null;
  /** Observed share/unit count, when the document shows one. */
  quantity?: number | null;
  /** Observed cost basis, when the document shows one. */
  costBasis?: number | null;
  confidence: Confidence;
  /** Verbatim text the model read off the document, for auditing. */
  observed: string;
  reason: string;
}

export interface StatementRequestInput {
  account: string;
  why: string;
}

export interface ReconcileInput {
  proposals: ReconcileProposalInput[];
  /** Accounts where the attachment was partial and a full statement would help. */
  needStatement: StatementRequestInput[];
  notes: string[];
}

/* ── what we render (resolved against the real ledger) ───────────────────── */

export type ChangeField = "value" | "quantity" | "costBasis";

export interface ReconcileChange {
  field: ChangeField;
  /** Current ledger figure; null when the row is new or the field is unset. */
  from: number | null;
  to: number;
  /** Percent change vs `from`; null when `from` is null/zero. */
  deltaPct: number | null;
}

export interface ReconcileProposal {
  kind: ProposalKind;
  /** Ledger row this applies to; null for a new row. */
  holdingId: string | null;
  account: string;
  symbol: string;
  name: string;
  assetClass: AssetClassKey;
  changes: ReconcileChange[];
  confidence: Confidence;
  observed: string;
  reason: string;
  /** Deterministic guardrail flags shown on the card before the owner approves. */
  warnings: string[];
}

export interface Reconciliation {
  proposals: ReconcileProposal[];
  needStatement: StatementRequestInput[];
  notes: string[];
  /** Proposals dropped by guardrails, with why — surfaced so nothing vanishes silently. */
  rejected: { account: string; symbol: string; why: string }[];
}

/** Value ratio beyond which a change is flagged as suspiciously large. */
const LARGE_CHANGE_RATIO = 10;
/** Absolute ceiling on any single proposed figure — catches OCR decimal slips. */
const MAX_FIGURE = 100_000_000;

const round2 = (n: number): number => Math.round(n * 100) / 100;

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Find the ledger row a proposal refers to. Matches on (account, symbol) — the
 * same identity the CSV import upserts on — with a symbol-only fallback when
 * exactly one row carries that symbol.
 */
export function matchHolding(holdings: Holding[], account: string, symbol: string): Holding | null {
  const a = norm(account);
  const s = norm(symbol);

  const exact = holdings.find((h) => norm(h.account) === a && norm(h.symbol) === s);
  if (exact) return exact;

  // Account labels vary between a statement and the ledger ("Roth IRA" vs
  // "Schwab · Roth IRA"), so allow a containment match on the account.
  const contained = holdings.filter(
    (h) => norm(h.symbol) === s && (norm(h.account).includes(a) || a.includes(norm(h.account))),
  );
  if (contained.length === 1) return contained[0] ?? null;

  const bySymbol = holdings.filter((h) => norm(h.symbol) === s);
  return bySymbol.length === 1 ? (bySymbol[0] ?? null) : null;
}

function isAssetClass(v: unknown): v is AssetClassKey {
  return typeof v === "string" && (ASSET_CLASS_KEYS as string[]).includes(v);
}

/** A finite, non-negative, in-range number, else null. */
function figure(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (n < 0 || n > MAX_FIGURE) return null;
  return round2(n);
}

function pctDelta(from: number | null, to: number): number | null {
  if (from == null || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

/**
 * Resolve the model's proposals against the real ledger: compute every
 * before/after, drop no-ops and anything a guardrail rejects, and flag the
 * changes that deserve a second look before the owner approves them.
 */
export function enrichReconciliation(input: ReconcileInput, holdings: Holding[]): Reconciliation {
  const proposals: ReconcileProposal[] = [];
  const rejected: Reconciliation["rejected"] = [];

  for (const p of input.proposals) {
    const account = p.account?.trim() ?? "";
    const symbol = (p.symbol ?? "").trim().toUpperCase();
    if (!symbol) {
      rejected.push({ account, symbol: p.symbol ?? "?", why: "no symbol given" });
      continue;
    }

    const existing = matchHolding(holdings, account, symbol);
    // The model's kind is advisory: what matters is whether the row exists.
    const kind: ProposalKind = existing ? "update" : "add";

    const value = figure(p.value);
    const quantity = figure(p.quantity);
    const costBasis = figure(p.costBasis);

    if (value == null && quantity == null && costBasis == null) {
      rejected.push({ account, symbol, why: "no usable figure could be read" });
      continue;
    }

    const warnings: string[] = [];
    const assetClass: AssetClassKey = isAssetClass(p.assetClass)
      ? p.assetClass
      : existing?.assetClass ?? "us_stock";
    if (kind === "add" && !isAssetClass(p.assetClass)) {
      warnings.push("Asset class was not stated — defaulted to US single stocks. Change it after applying.");
    }

    const changes: ReconcileChange[] = [];
    const push = (field: ChangeField, from: number | null, to: number | null) => {
      if (to == null) return;
      if (from != null && round2(from) === to) return; // no-op
      changes.push({ field, from, to, deltaPct: pctDelta(from, to) });
    };

    push("value", existing ? existing.value : null, value);
    push("quantity", existing?.quantity ?? null, quantity);
    push("costBasis", existing ? existing.costBasis : null, costBasis);

    if (changes.length === 0) {
      rejected.push({ account, symbol, why: "already matches the ledger" });
      continue;
    }

    // Cash carries no gain: its basis tracks its value. Keep them aligned so a
    // contribution never shows up as a phantom gain or loss.
    const effectiveClass = existing?.assetClass ?? assetClass;
    if (effectiveClass === "cash") {
      const v = changes.find((c) => c.field === "value");
      const cb = changes.find((c) => c.field === "costBasis");
      if (v && !cb) {
        changes.push({ field: "costBasis", from: existing?.costBasis ?? null, to: v.to, deltaPct: null });
        warnings.push("Cash has no gain, so cost basis is kept equal to value.");
      } else if (v && cb && cb.to !== v.to) {
        cb.to = v.to;
        warnings.push("Cash basis realigned to match value.");
      }
    }

    // Flag order-of-magnitude jumps — the classic OCR decimal slip.
    for (const c of changes) {
      // Inclusive: an exactly-10x jump is the classic misplaced decimal.
      if (c.from != null && c.from > 0 && (c.to / c.from >= LARGE_CHANGE_RATIO || c.to / c.from <= 1 / LARGE_CHANGE_RATIO)) {
        warnings.push(
          `${c.field} changes by ${c.deltaPct != null ? `${c.deltaPct > 0 ? "+" : ""}${c.deltaPct.toFixed(0)}%` : "a large amount"} — double-check the figure.`,
        );
      }
      if (c.field === "value" && c.to === 0) warnings.push("Value would become $0 — confirm this position is closed.");
    }

    if (p.confidence === "low") warnings.push("The model was unsure it read this correctly.");

    // A new row with no basis counts its whole value as unrealized gain, which
    // quietly inflates portfolio ROI. Cash is exempt — its basis tracks value.
    if (
      kind === "add" &&
      effectiveClass !== "cash" &&
      !changes.some((c) => c.field === "costBasis")
    ) {
      warnings.push("No cost basis was visible — it will be added as $0, which overstates ROI until you set it.");
    }

    proposals.push({
      kind,
      holdingId: existing?.id ?? null,
      account: existing?.account ?? account,
      symbol,
      name: (p.name ?? "").trim() || existing?.name || symbol,
      assetClass,
      changes,
      confidence: p.confidence === "high" || p.confidence === "medium" ? p.confidence : "low",
      observed: (p.observed ?? "").slice(0, 300),
      reason: (p.reason ?? "").slice(0, 400),
      warnings,
    });
  }

  return {
    proposals,
    needStatement: (input.needStatement ?? []).filter((r) => r.account?.trim()).slice(0, 5),
    notes: (input.notes ?? []).filter(Boolean).slice(0, 5),
    rejected,
  };
}

/** The patch to send to the holdings API when a proposal is approved. */
export function proposalPatch(p: ReconcileProposal): Record<string, number> {
  const patch: Record<string, number> = {};
  for (const c of p.changes) patch[c.field] = c.to;
  return patch;
}

/**
 * JSON schema handed to the model via structured outputs.
 *
 * Note: structured outputs reject `maxItems` on arrays, so the caps live in the
 * zod schema on the route (and in these descriptions) rather than here.
 */
export const RECONCILE_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["proposals", "needStatement", "notes"],
  properties: {
    proposals: {
      type: "array",
      description: "One entry per position that differs from the ledger or is missing from it. At most 40.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "account", "symbol", "confidence", "observed", "reason"],
        properties: {
          kind: { type: "string", enum: ["update", "add"] },
          account: { type: "string", description: "Account name, matching the ledger's label when possible." },
          symbol: { type: "string" },
          name: { type: "string" },
          assetClass: { type: "string", enum: ASSET_CLASS_KEYS },
          value: { type: ["number", "null"], description: "Market value read from the document." },
          quantity: { type: ["number", "null"], description: "Share/unit count read from the document." },
          costBasis: { type: ["number", "null"], description: "Cost basis read from the document." },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          observed: { type: "string", description: "The exact text you read, e.g. 'Cash & Cash Investments $10,701.20'." },
          reason: { type: "string", description: "One short phrase on why this differs from the ledger." },
        },
      },
    },
    needStatement: {
      type: "array",
      description: "Accounts where the attachment was partial and a full statement is needed. At most 5.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["account", "why"],
        properties: {
          account: { type: "string" },
          why: { type: "string", description: "What the attachment didn't show that a full statement would." },
        },
      },
    },
    notes: {
      type: "array",
      description: "Short caveats about what was or wasn't legible. At most 5.",
      items: { type: "string" },
    },
  },
} as const;
