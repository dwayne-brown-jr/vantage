"use client";

import { useEffect, useState } from "react";

import { CalendarClock, Coins, TrendingUp } from "lucide-react";

import { MIN_DAYS_FOR_CAGR, type GrowthResult } from "@/lib/growth";
import { fmtPct, fmtSignedPct, fmtUSD } from "@/lib/format";
import type { IncomeSummary } from "@/lib/income";

interface Payload {
  income: IncomeSummary;
  growth: GrowthResult;
}

/** "$1,234.56" — income is small enough that cents matter. */
const fmtCents = (n: number): string =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GrowthIncome() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    fetch("/api/income", { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json()) as Partial<Payload> & { error?: string };
        if (!r.ok || !body.income || !body.growth) throw new Error(body.error ?? `Request failed (${r.status})`);
        if (on) setData({ income: body.income, growth: body.growth });
      })
      .catch((e) => on && setError(e instanceof Error ? e.message : "Couldn't load growth and income."));
    return () => {
      on = false;
    };
  }, []);

  if (error) {
    return (
      <div className="card">
        <div className="sectit">Growth &amp; income</div>
        <p className="warn">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card">
        <div className="sectit">Growth &amp; income</div>
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  const { growth, income } = data;

  return (
    <div className="card">
      <div className="sectit">Growth &amp; income</div>
      <div className="gi-grid">
        <GrowthTile growth={growth} />
        <IncomeTile income={income} />
      </div>
    </div>
  );
}

/**
 * Growth. Deliberately shows one of three states rather than always printing a
 * number: annualizing a short window manufactures huge figures, so a young
 * history says so instead.
 */
function GrowthTile({ growth }: { growth: GrowthResult }) {
  if (growth.status === "insufficient") {
    return (
      <div className="gi-tile">
        <div className="gi-label">
          <CalendarClock size={13} /> Growth rate
        </div>
        <div className="gi-value muted">—</div>
        <div className="gi-sub">
          {growth.startDay
            ? `Tracking since ${growth.startDay} · needs ${growth.daysUntilNext} more day${growth.daysUntilNext === 1 ? "" : "s"} of history`
            : "No history yet — snapshots record on each price refresh, and once a day on the server."}
        </div>
      </div>
    );
  }

  if (growth.status === "cumulative") {
    const pct = growth.totalReturnPct ?? 0;
    return (
      <div className="gi-tile">
        <div className="gi-label">
          <TrendingUp size={13} /> Value change
        </div>
        <div className={"gi-value " + (pct >= 0 ? "pos" : "neg")}>{fmtSignedPct(pct)}</div>
        <div className="gi-sub">
          Over {growth.days} days, {growth.startDay} → {growth.endDay}. Not annualized — {growth.daysUntilNext} more
          days to a meaningful CAGR.
        </div>
      </div>
    );
  }

  const cagrPct = growth.cagrPct ?? 0;
  const years = growth.days / 365.25;
  return (
    <div className="gi-tile">
      <div className="gi-label">
        <TrendingUp size={13} /> CAGR
      </div>
      <div className={"gi-value " + (cagrPct >= 0 ? "pos" : "neg")}>{fmtSignedPct(cagrPct)}</div>
      <div className="gi-sub">
        Compound annual growth over {years.toFixed(1)} years ({fmtUSD(growth.startValue ?? 0)} →{" "}
        {fmtUSD(growth.endValue ?? 0)}). Value change {fmtSignedPct(growth.totalReturnPct ?? 0)} in total.
      </div>
    </div>
  );
}

/** Dividend yield, with coverage stated so a partial figure is never mistaken for a full one. */
function IncomeTile({ income }: { income: IncomeSummary }) {
  const hasAny = income.covered > 0;
  return (
    <div className="gi-tile">
      <div className="gi-label">
        <Coins size={13} /> Dividend yield
      </div>
      <div className={"gi-value " + (hasAny ? "" : "muted")}>
        {hasAny && income.yieldPct != null ? fmtPct(income.yieldPct) : "—"}
      </div>
      <div className="gi-sub">
        {hasAny ? (
          <>
            {fmtCents(income.annualIncome)}/yr · {fmtCents(income.monthlyIncome)}/mo, trailing 12 months.
            {!income.complete && (
              <>
                {" "}
                <span className="gi-warn">
                  Covers {fmtPct(income.coveragePct)} of the portfolio — a floor, not the full figure.{" "}
                  {income.uncoveredSymbols.slice(0, 4).join(", ")}
                  {income.uncoveredSymbols.length > 4 ? `, +${income.uncoveredSymbols.length - 4} more` : ""} need
                  share counts.
                </span>
              </>
            )}
          </>
        ) : (
          "No position has both a share count and a dividend rate yet — run “Estimate shares” on the Holdings tab."
        )}
      </div>
    </div>
  );
}

export { MIN_DAYS_FOR_CAGR };
