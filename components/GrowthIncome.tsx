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

/** "Aug 25, 2026" — a date a client reads, not an ISO string. */
function friendlyDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Two holdings" rather than a list of tickers a client won't recognise. */
function describeUncovered(n: number): string {
  if (n <= 0) return "Some holdings are";
  if (n === 1) return "One holding is";
  return `${n} holdings are`;
}

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
          <CalendarClock size={13} /> Annual growth
        </div>
        {/* An em dash as the value reads as broken software; say when it arrives. */}
        <div className="gi-value muted text-phrase">
          {growth.startDay ? `Starts in ${growth.daysUntilNext} day${growth.daysUntilNext === 1 ? "" : "s"}` : "Not yet"}
        </div>
        <div className="gi-sub">
          {growth.startDay
            ? `We began tracking your balance on ${friendlyDate(growth.startDay)}. Measuring growth needs at least a week.`
            : "Your balance is recorded each time prices refresh, and once a day automatically."}
        </div>
      </div>
    );
  }

  if (growth.status === "cumulative") {
    const pct = growth.totalReturnPct ?? 0;
    return (
      <div className="gi-tile">
        <div className="gi-label">
          <TrendingUp size={13} /> Change so far
        </div>
        <div className={"gi-value " + (pct >= 0 ? "pos" : "neg")}>{fmtSignedPct(pct)}</div>
        <div className="gi-sub">
          Since {friendlyDate(growth.startDay ?? "")}, about {Math.round(growth.days / 7)} weeks. Too early to state a
          yearly rate — that needs a full year.
        </div>
      </div>
    );
  }

  const cagrPct = growth.cagrPct ?? 0;
  const years = growth.days / 365.25;
  return (
    <div className="gi-tile">
      <div className="gi-label">
        <TrendingUp size={13} /> Annual growth
      </div>
      <div className={"gi-value " + (cagrPct >= 0 ? "pos" : "neg")}>{fmtSignedPct(cagrPct)}</div>
      <div className="gi-sub">
        Average per year over {years.toFixed(1)} years — {fmtUSD(growth.startValue ?? 0)} grew to{" "}
        {fmtUSD(growth.endValue ?? 0)}, {fmtSignedPct(growth.totalReturnPct ?? 0)} in total.
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
        <Coins size={13} /> Dividend income
      </div>
      {/* Dollars, not a yield: nobody thinks "0.3%", they think "$20 a month". */}
      <div className={"gi-value " + (hasAny ? "" : "muted")}>
        {hasAny ? `${fmtUSD(income.annualIncome)}/yr` : "—"}
      </div>
      <div className="gi-sub">
        {hasAny ? (
          <>
            About {fmtUSD(income.monthlyIncome)} a month, based on the last 12 months of payouts
            {income.yieldPct != null ? ` (${fmtPct(income.yieldPct)} of your total)` : ""}.
            {!income.complete && (
              <>
                {" "}
                <span className="gi-warn">
                  {describeUncovered(income.uncoveredSymbols.length)} not included, so your real income is a little
                  higher.
                </span>
              </>
            )}
          </>
        ) : (
          "We don’t have share counts yet — use “Estimate shares” on the Holdings tab and this will fill in."
        )}
      </div>
    </div>
  );
}

export { MIN_DAYS_FOR_CAGR };
