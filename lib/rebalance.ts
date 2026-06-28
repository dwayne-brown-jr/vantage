/**
 * Deterministic, target-driven rebalance. Given the portfolio and the owner's
 * editable bucket targets, it picks exactly which holdings to sell (from
 * over-weighted buckets) and where to redeploy (into under-weighted buckets) —
 * no LLM, instant, free. The output is a PlanInput, so it flows through the same
 * enrichPlan() tax math and PlanCards UI as the AI plan.
 *
 * Selection rules, in order:
 *  • Never sell the taxable SWPPX (the owner's stated hold).
 *  • Never trim the target-date fund (it's already a balanced sleeve).
 *  • Sell tax-advantaged (Roth / 401k) positions first — they're tax-free to
 *    rebalance — then largest positions.
 *  • Redeploy by adding to an existing fund in the under-weighted bucket
 *    (tax-advantaged first); only suggest a brand-new fund when none is held.
 */
import { classifyAccount, type TaxTreatment } from "@/lib/accounts";
import { targetGaps, type PortfolioAnalysis } from "@/lib/analytics";
import { ASSET_CLASSES } from "@/lib/constants";
import { fmtUSD } from "@/lib/format";
import type { PlanInput } from "@/lib/plan";
import type { Holding } from "@/lib/types";

/** The owner's stated hold: the taxable SWPPX position is not sold. */
const isHeld = (h: Holding): boolean =>
  classifyAccount(h.account).treatment === "taxable" && h.symbol === "SWPPX";

/** High-level bucket label for a holding (matches target labels; TDF → "Blend"). */
const bucketOf = (h: Holding): string => ASSET_CLASSES[h.assetClass].bucket;

const isTaxFree = (account: string): boolean => classifyAccount(account).taxFreeToRebalance;

/** Sort: tax-free accounts first, then larger positions. */
function byTaxThenSize(a: Holding, b: Holding): number {
  const fa = isTaxFree(a.account) ? 0 : 1;
  const fb = isTaxFree(b.account) ? 0 : 1;
  return fa !== fb ? fa - fb : b.value - a.value;
}

/** Pick sells from a bucket until `amount` is covered. */
function sellsFromBucket(holdings: Holding[], bucket: string, amount: number): PlanInput["sells"] {
  let remaining = amount;
  const candidates = holdings
    .filter((h) => bucketOf(h) === bucket && h.assetClass !== "tdf" && !isHeld(h) && h.value > 1)
    .sort(byTaxThenSize);

  const moves: PlanInput["sells"] = [];
  for (const h of candidates) {
    if (remaining <= 1) break;
    const take = Math.min(h.value, remaining);
    if (take < 1) continue;
    moves.push({
      account: h.account,
      symbol: h.symbol,
      amount: Math.round(take),
      reason:
        bucket === "Cash"
          ? "Deploy idle cash"
          : `Trim ${bucket} overweight${isTaxFree(h.account) ? " — tax-free here" : ""}`,
    });
    remaining -= take;
  }
  return moves;
}

/** Largest account total, optionally preferring a tax treatment. */
function pickAccount(holdings: Holding[], prefer?: TaxTreatment, taxFreeOnly = false): string {
  const totals = new Map<string, number>();
  for (const h of holdings) totals.set(h.account, (totals.get(h.account) ?? 0) + h.value);
  let accts = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (taxFreeOnly) {
    const tf = accts.filter(([acc]) => isTaxFree(acc));
    if (tf.length) accts = tf;
  }
  if (prefer) {
    const p = accts.find(([acc]) => classifyAccount(acc).treatment === prefer);
    if (p) return p[0];
  }
  return accts[0]?.[0] ?? holdings[0]?.account ?? "Brokerage";
}

/** Choose where to buy for an under-weighted bucket. */
function buyForBucket(holdings: Holding[], bucket: string, amount: number): PlanInput["reinvests"][number] | null {
  if (amount < 1) return null;
  const amt = Math.round(amount);

  if (bucket === "Cash") {
    return { account: "Cash", symbol: "CASH", name: "Cash & money market", amount: amt, reason: "Build cash buffer toward target" };
  }

  // Add to the biggest existing fund in this bucket (tax-advantaged first).
  const existing = holdings
    .filter((h) => bucketOf(h) === bucket && h.assetClass !== "tdf" && h.assetClass !== "cash")
    .sort(byTaxThenSize)[0];
  if (existing) {
    return {
      account: existing.account,
      symbol: existing.symbol,
      name: existing.name,
      amount: amt,
      reason: `Add to ${bucket} to close the gap${isTaxFree(existing.account) ? " — tax-free here" : ""}`,
    };
  }

  // Nothing held in this bucket — suggest a new low-cost index fund.
  if (bucket === "Bonds") {
    return {
      account: pickAccount(holdings, "traditional", true),
      symbol: "BND",
      name: "Total bond market index (suggested)",
      amount: amt,
      reason: "Open bonds in tax-deferred — bonds are tax-inefficient",
    };
  }
  if (bucket === "International") {
    return {
      account: pickAccount(holdings, "roth", true),
      symbol: "VXUS",
      name: "Total international index (suggested)",
      amount: amt,
      reason: "Open international in the Roth — growth is tax-free",
    };
  }
  return {
    account: pickAccount(holdings, "roth", true),
    symbol: "VTI",
    name: "US total market index (suggested)",
    amount: amt,
    reason: "Add broad US equity",
  };
}

/**
 * Build a deterministic rebalance to the given bucket targets. Returns a
 * PlanInput (summary + sells + reinvests + cautions) ready for enrichPlan().
 */
export function computeRebalance(
  holdings: Holding[],
  a: PortfolioAnalysis,
  targets: Record<string, number>,
): PlanInput {
  const gaps = targetGaps(a.buckets, targets, a.total);
  // Ignore noise; only act on buckets that are off by a meaningful amount.
  const threshold = Math.max(a.total * 0.005, 25);

  const sells: PlanInput["sells"] = [];
  for (const g of gaps) {
    if (g.deltaDollar < -threshold) sells.push(...sellsFromBucket(holdings, g.label, -g.deltaDollar));
  }

  const reinvests: PlanInput["reinvests"] = [];
  for (const g of gaps) {
    if (g.deltaDollar > threshold) {
      const buy = buyForBucket(holdings, g.label, g.deltaDollar);
      if (buy) reinvests.push(buy);
    }
  }

  const targetSum = Object.values(targets).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  const cautions: string[] = [
    "Computed mechanically from your target % — verify fund availability in each account and any trading windows.",
  ];
  if (Math.abs(targetSum - 100) > 1) {
    cautions.unshift(`Your targets sum to ${Math.round(targetSum)}%, not 100% — sells and buys won't fully net out.`);
  }

  const moved = sells.reduce((s, x) => s + x.amount, 0);
  const summary =
    sells.length === 0 && reinvests.length === 0
      ? "You're within ~1% of every target — no rebalancing needed."
      : `Rebalance to your targets: trim ${fmtUSD(moved)} from over-weighted buckets and redeploy into ${reinvests
          .map((r) => r.symbol)
          .join(", ")} to close the gaps.`;

  return { summary, sells, reinvests, cautions };
}
