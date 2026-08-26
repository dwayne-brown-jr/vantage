import type { PortfolioAnalysis } from "@/lib/analytics";
import { COMFORT_CEILING } from "@/lib/constants";
import { fmtPct, fmtSignedUSD, fmtUSD } from "@/lib/format";

/**
 * The four headline figures, shared across tabs.
 *
 * Labels are deliberately plain: a client reads these in about five seconds
 * and should not have to translate accounting terms. "What you put in" carries
 * BOTH halves of its comparison — the amount paid AND what it is worth now —
 * because those figures previously sat in separate tiles that looked
 * subtractable and were not: one counts cash and the other doesn't, so the
 * difference between them was a number that meant nothing.
 */
export default function KpiStrip({ a }: { a: PortfolioAnalysis }) {
  const overCeiling = (a.tsla?.pct ?? 0) > COMFORT_CEILING;
  const up = a.unrealized >= 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi
        label="Total value"
        value={fmtUSD(a.total)}
        sub={`across ${a.byAccount.length} accounts · includes ${fmtUSD(a.cashTotal)} cash`}
      />
      <Kpi label="What you put in" value={fmtUSD(a.invested)} sub={`now worth ${fmtUSD(a.investedValue)}`} />
      <Kpi
        label={up ? "Total gain" : "Total loss"}
        value={fmtSignedUSD(a.unrealized)}
        sub={`${up ? "up" : "down"} ${fmtPct(Math.abs(a.roi))} · on paper, not yet sold`}
        tone={up ? "pos" : "neg"}
      />
      {/* Only styled as a risk when it actually is one — a red tile on a
          within-tolerance figure trains the eye to ignore the warning. */}
      <Kpi
        label="Tesla exposure"
        value={a.tsla ? fmtPct(a.tsla.pct) : "0%"}
        sub={
          a.tslaUnvested > 0
            ? `${fmtPct(a.tslaExposurePct)} counting unvested RSUs · aiming under ${COMFORT_CEILING}%`
            : `${fmtUSD(a.tsla?.value ?? 0)} · aiming under ${COMFORT_CEILING}% of the total`
        }
        tone={overCeiling ? "neg" : undefined}
        risk={overCeiling}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
  risk,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "pos" | "neg";
  risk?: boolean;
}) {
  return (
    <div className={`rounded-2xl border bg-surface p-5 ${risk ? "border-red/35" : "border-line"}`}>
      <div className="mb-2.5 text-[11px] uppercase tracking-[0.15em] text-faint">{label}</div>
      <div
        className={`mono text-3xl font-medium leading-none tracking-tight ${
          tone === "pos" ? "text-green" : tone === "neg" ? "text-red" : "text-txt"
        }`}
      >
        {value}
      </div>
      <div className={`mt-2 text-xs ${tone === "pos" ? "text-green" : "text-muted"}`}>{sub}</div>
    </div>
  );
}
