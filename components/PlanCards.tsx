import { ArrowDownRight, ArrowUpRight, TriangleAlert } from "lucide-react";

import type { Plan } from "@/lib/plan";
import { fmtSignedPct, fmtUSD } from "@/lib/format";

/** Render a structured rebalance plan as red Sell / green Buy action cards. */
export default function PlanCards({ plan }: { plan: Plan }) {
  const hasMoves = plan.sells.length > 0 || plan.reinvests.length > 0;

  return (
    <div className="plan">
      {plan.summary && <div className="plan-summary">{plan.summary}</div>}

      {hasMoves && (
        <div className="plan-totals">
          <Tile label="Sell" value={fmtUSD(plan.totalSell)} />
          <Tile label="Est. tax" value={fmtUSD(plan.totalTax)} tone="neg" />
          <Tile label="Freed to reinvest" value={fmtUSD(plan.totalNet)} tone="pos" />
          <Tile label="Reinvested" value={fmtUSD(plan.totalReinvest)} />
        </div>
      )}

      {plan.sells.length > 0 && (
      <div className="plan-sec">
        <div className="plan-sec-h sell">
          <ArrowDownRight size={14} /> Sell
        </div>
        {plan.sells.map((s, i) => (
          <div className="plan-card sell" key={i}>
            <div className="plan-card-top">
              <div className="plan-card-id">
                <span className="plan-sym">{s.symbol}</span>
                <span className="plan-acct">{s.account}</span>
              </div>
              <div className="plan-amt">{fmtUSD(s.amount)}</div>
            </div>
            <div className="plan-why">{s.reason}</div>
            <div className="plan-tax">
              {s.taxFree ? (
                <span className="tax-free">Tax-free to rebalance</span>
              ) : (
                <>
                  <span>≈{fmtUSD(s.taxCost)} tax</span>
                  <span className="dot">·</span>
                  <span className="net">{fmtUSD(s.netProceeds)} net</span>
                  <span className="dot">·</span>
                  <span className="gain">{fmtSignedPct(s.roiPct)} ROI</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      )}

      {plan.reinvests.length > 0 && (
      <div className="plan-sec">
        <div className="plan-sec-h buy">
          <ArrowUpRight size={14} /> Reinvest
        </div>
        {plan.reinvests.map((b, i) => (
          <div className="plan-card buy" key={i}>
            <div className="plan-card-top">
              <div className="plan-card-id">
                <span className="plan-sym">{b.symbol}</span>
                <span className="plan-name">{b.name}</span>
                <span className="plan-acct">→ {b.account}</span>
              </div>
              <div className="plan-amt">{fmtUSD(b.amount)}</div>
            </div>
            <div className="plan-why">{b.reason}</div>
          </div>
        ))}
      </div>
      )}

      {plan.cautions.length > 0 && (
        <div className="plan-cautions">
          {plan.cautions.map((c, i) => (
            <div className="plan-caution" key={i}>
              <TriangleAlert size={12} /> <span>{c}</span>
            </div>
          ))}
        </div>
      )}

      <div className="plan-disc">
        Tax is an educational estimate — only the gain portion is taxed (long-term 15% + 3.8% NIIT assumed), tax-advantaged
        accounts cost nothing. Amounts are the strategist&apos;s suggestion; verify before trading.
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="plan-tile">
      <div className="plan-tile-l">{label}</div>
      <div className={"plan-tile-v" + (tone ? " " + tone : "")}>{value}</div>
    </div>
  );
}
