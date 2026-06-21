"use client";

import { useEffect, useState } from "react";

import { CalendarPlus } from "lucide-react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { PortfolioAnalysis } from "@/lib/analytics";
import { fetchSnapshots, saveSnapshot } from "@/lib/api";
import { COMFORT_CEILING } from "@/lib/constants";
import { fmtPct, fmtSignedPct, fmtSignedUSD, fmtUSD } from "@/lib/format";
import type { Snapshot } from "@/lib/snapshots";

const tooltipProps = {
  contentStyle: {
    background: "#1B2029",
    border: "1px solid #262C36",
    borderRadius: 8,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
  },
  itemStyle: { color: "#E7E3DA" },
  labelStyle: { color: "#8A8F99" },
} as const;
const xAxisProps = { tick: { fill: "#8A8F99", fontSize: 10 }, axisLine: { stroke: "#262C36" }, tickLine: false } as const;
const yAxisProps = { tick: { fill: "#5A616C", fontSize: 10 }, axisLine: false, tickLine: false, width: 44 } as const;

const fmtDay = (day: string): string => {
  const [, m, d] = day.split("-");
  return `${Number(m)}/${Number(d)}`;
};

export default function History({ a }: { a: PortfolioAnalysis }) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    fetchSnapshots()
      .then((s) => on && setSnapshots(s))
      .catch((e) => on && setError(e instanceof Error ? e.message : "Could not load history."));
    return () => {
      on = false;
    };
  }, []);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      setSnapshots(await saveSnapshot());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save snapshot.");
    } finally {
      setSaving(false);
    }
  }

  const saved = snapshots ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const hasToday = saved.some((s) => s.day === today);
  const points = [
    ...saved.map((s) => ({ label: fmtDay(s.day), total: s.total, tslaPct: s.tslaPct })),
    ...(hasToday ? [] : [{ label: "now", total: a.total, tslaPct: a.tsla?.pct ?? 0 }]),
  ];

  const first = points[0];
  const last = points[points.length - 1];
  const enoughForTrend = points.length >= 2 && first && last;
  const valueChange = enoughForTrend ? last.total - first.total : 0;
  const tslaChange = enoughForTrend ? last.tslaPct - first.tslaPct : 0;

  return (
    <>
      <div className="card">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <div className="sectit" style={{ margin: 0 }}>
            Progress over time
          </div>
          <button className="btn-ghost" disabled={saving} onClick={() => void onSave()}>
            <CalendarPlus size={15} /> {saving ? "Saving…" : "Save snapshot"}
          </button>
        </div>

        {error && <p className="warn mb-2">{error}</p>}

        {snapshots === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Tesla concentration" value={a.tsla ? fmtPct(a.tsla.pct) : "0%"} tone="neg" />
              <Stat
                label="Change in Tesla %"
                value={enoughForTrend ? fmtSignedPct(tslaChange) : "—"}
                sub={enoughForTrend ? (tslaChange <= 0 ? "diversifying ✓" : "rising") : "needs 2+ days"}
                tone={enoughForTrend ? (tslaChange <= 0 ? "pos" : "neg") : undefined}
              />
              <Stat label="Portfolio value" value={fmtUSD(a.total)} />
              <Stat
                label="Change in value"
                value={enoughForTrend ? fmtSignedUSD(valueChange) : "—"}
                tone={enoughForTrend ? (valueChange >= 0 ? "pos" : "neg") : undefined}
              />
            </div>

            {points.length < 2 ? (
              <p className="disc mt-4">
                Your trend lines fill in as snapshots accumulate — one is captured automatically each time you refresh
                prices (and once a day on the server), or hit “Save snapshot” to add today now. Come back over the next
                few days to watch Tesla concentration trend toward your ceiling.
              </p>
            ) : (
              <div className="mt-4 grid gap-[18px] md:grid-cols-2">
                <div>
                  <div className="sectit">Tesla concentration over time</div>
                  <ResponsiveContainer width="100%" height={230}>
                    <LineChart data={points} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                      <XAxis dataKey="label" {...xAxisProps} />
                      <YAxis {...yAxisProps} tickFormatter={(v) => Number(v).toFixed(0) + "%"} domain={[0, "auto"]} />
                      <Tooltip {...tooltipProps} formatter={(v) => [fmtPct(Number(v)), "TSLA"]} />
                      <ReferenceLine
                        y={COMFORT_CEILING}
                        stroke="#CDA434"
                        strokeDasharray="4 4"
                        label={{ value: `ceiling ${COMFORT_CEILING}%`, fill: "#CDA434", fontSize: 10, position: "insideTopRight" }}
                      />
                      <Line type="monotone" dataKey="tslaPct" stroke="#C75D5D" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <div className="sectit">Portfolio value over time</div>
                  <ResponsiveContainer width="100%" height={230}>
                    <LineChart data={points} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                      <XAxis dataKey="label" {...xAxisProps} />
                      <YAxis
                        {...yAxisProps}
                        tickFormatter={(v) => "$" + Math.round(Number(v) / 1000) + "k"}
                        domain={["auto", "auto"]}
                      />
                      <Tooltip {...tooltipProps} formatter={(v) => [fmtUSD(Number(v)), "Value"]} />
                      <Line type="monotone" dataKey="total" stroke="#CDA434" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface2 p-4">
      <div className="text-[11px] uppercase tracking-[0.12em] text-faint">{label}</div>
      <div className={`mono mt-1.5 text-2xl font-medium ${tone === "pos" ? "text-green" : tone === "neg" ? "text-red" : "text-txt"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
