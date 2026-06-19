import type { PortfolioAnalysis } from "@/lib/analytics";
import { COMFORT_CEILING } from "@/lib/constants";
import { fmtPct, fmtSignedUSD, fmtUSD } from "@/lib/format";

/** The four headline KPI cards, shared across tabs. */
export default function KpiStrip({ a }: { a: PortfolioAnalysis }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi label="Portfolio" value={fmtUSD(a.total)} sub={`${a.byAccount.length} accounts · ${fmtUSD(a.cashTotal)} cash`} />
      <Kpi label="Invested" value={fmtUSD(a.invested)} sub="cost basis, excl. cash" />
      <Kpi
        label="Unrealized profit"
        value={fmtSignedUSD(a.unrealized)}
        sub={`ROI ${fmtPct(a.roi)}`}
        tone={a.unrealized >= 0 ? "pos" : "neg"}
      />
      <Kpi
        label="Tesla concentration"
        value={a.tsla ? fmtPct(a.tsla.pct) : "0%"}
        sub={`comfort ~${COMFORT_CEILING}% · ${fmtUSD(a.tsla?.value ?? 0)}`}
        tone="neg"
        risk
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
