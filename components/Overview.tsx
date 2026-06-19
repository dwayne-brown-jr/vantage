"use client";

import { TriangleAlert } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import Donut from "@/components/Donut";
import KpiStrip from "@/components/KpiStrip";
import type { PortfolioAnalysis } from "@/lib/analytics";
import { ASSET_CLASSES, COMFORT_CEILING } from "@/lib/constants";
import { fmtPct, fmtUSD } from "@/lib/format";

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
  cursor: { fill: "rgba(255,255,255,0.04)" },
} as const;

const xAxisProps = {
  tick: { fill: "#8A8F99", fontSize: 10 },
  axisLine: { stroke: "#262C36" },
  tickLine: false,
} as const;

const yAxisProps = {
  tick: { fill: "#5A616C", fontSize: 10 },
  axisLine: false,
  tickLine: false,
  width: 42,
} as const;

interface WatchItem {
  color: string;
  title: string;
  desc: string;
}

function watchItems(a: PortfolioAnalysis): WatchItem[] {
  const items: WatchItem[] = [];

  if (a.tsla && a.tsla.pct > COMFORT_CEILING) {
    items.push({
      color: "#C75D5D",
      title: "Tesla concentration stacked on Tesla income",
      desc: `Single-name exposure of ${fmtPct(a.tsla.pct)} sits far above the ~${COMFORT_CEILING}% comfort line, compounded by salary, benefits, and vesting RSUs all riding on one company.`,
    });
  }

  // Any other single name above the comfort ceiling.
  for (const s of a.singles) {
    if (s.symbol !== "TSLA" && s.pct > COMFORT_CEILING) {
      items.push({
        color: "#D98C5F",
        title: `${s.symbol} is also above the comfort line at ${fmtPct(s.pct)}`,
        desc: `A second concentrated single-name position worth ${fmtUSD(s.value)}.`,
      });
    }
  }

  if (a.intlPct < 15) {
    items.push({
      color: "#D98C5F",
      title: `International is thin at ${fmtPct(a.intlPct)}`,
      desc: "Most of your international comes from the 2060 target-date fund. Growing it — best in the tax-free Roth — is the cleanest fix.",
    });
  }

  if (a.specTotal > 0) {
    items.push({
      color: "#7A8FA6",
      title: `${fmtUSD(a.specTotal)} in speculative satellites`,
      desc: "Holdings tagged speculative add cost and volatility without diversifying — candidates to clear.",
    });
  }

  return items;
}

export default function Overview({ a }: { a: PortfolioAnalysis }) {
  const top = a.symbols.slice(0, 8);
  const acctData = a.byAccount.map((x) => ({
    label: x.account.includes(" · ") ? (x.account.split(" · ").pop() ?? x.account) : x.account,
    value: x.value,
  }));
  const fillPct = Math.min(100, a.tsla ? a.tsla.pct : 0);
  const watch = watchItems(a);

  return (
    <>
      <div className="mb-[18px]">
        <KpiStrip a={a} />
      </div>

      {/* allocation donuts */}
      <div className="grid3">
        <Donut title="By asset class" data={a.byClass} />
        <Donut title="US · Intl · Bonds · Cash" data={a.buckets} />
        <Donut title="By account" data={acctData} />
      </div>

      {/* per-holding bar charts */}
      <div className="grid3">
        <div className="card">
          <div className="sectit">Invested vs. value</div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={top} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <XAxis dataKey="symbol" {...xAxisProps} interval={0} angle={-35} textAnchor="end" height={46} />
              <YAxis {...yAxisProps} tickFormatter={(v) => "$" + Math.round(Number(v) / 1000) + "k"} />
              <Tooltip
                {...tooltipProps}
                formatter={(v, n) => [fmtUSD(Number(v)), n === "costBasis" ? "Invested" : "Value"]}
              />
              <Bar dataKey="costBasis" name="costBasis" fill="#7A8FA6" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="value" name="value" fill="#CDA434" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="sectit">Unrealized profit by holding</div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={top} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <XAxis dataKey="symbol" {...xAxisProps} interval={0} angle={-35} textAnchor="end" height={46} />
              <YAxis {...yAxisProps} tickFormatter={(v) => "$" + Math.round(Number(v) / 1000) + "k"} />
              <Tooltip {...tooltipProps} formatter={(v) => [fmtUSD(Number(v)), "Unrealized"]} />
              <Bar dataKey="unrealized" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {top.map((s, i) => (
                  <Cell key={i} fill={s.unrealized >= 0 ? "#5FA37E" : "#C75D5D"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="sectit">ROI % by holding</div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={top} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <XAxis dataKey="symbol" {...xAxisProps} interval={0} angle={-35} textAnchor="end" height={46} />
              <YAxis {...yAxisProps} tickFormatter={(v) => Number(v).toFixed(0) + "%"} />
              <Tooltip {...tooltipProps} formatter={(v) => [fmtPct(Number(v)), "ROI"]} />
              <Bar dataKey="roi" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {top.map((s, i) => (
                  <Cell key={i} fill={s.roi >= 0 ? "#CDA434" : "#C75D5D"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* concentration hero + watch items */}
      <div className="cols">
        <div className="card">
          <div className="sectit">Single-name concentration</div>
          <div className="meter" style={{ marginTop: 0 }}>
            <div className="meterhead">
              <span className="big">{a.tsla ? fmtPct(a.tsla.pct) : "0%"}</span>
              <span className="mono" style={{ color: "var(--muted)", fontSize: 13 }}>
                TSLA · {fmtUSD(a.tsla?.value ?? 0)}
              </span>
            </div>
            <div className="track">
              <div className="fill" style={{ width: fillPct + "%" }} />
              <div className="thresh" style={{ left: COMFORT_CEILING + "%" }}>
                <span>comfort ~{COMFORT_CEILING}%</span>
              </div>
            </div>
            <div className="meternote">
              A third of your portfolio is one stock — <b>and Tesla also signs your paycheck</b>, funds your benefits,
              and is the source of these RSUs. The Plan tab projects how selling vests brings this down.
            </div>
          </div>
        </div>

        <div className="card flags">
          <div className="sectit">Watch items</div>
          {watch.length === 0 ? (
            <p className="text-sm text-muted">Nothing flagged — allocation looks balanced.</p>
          ) : (
            watch.map((w, i) => (
              <div className="flag" key={i}>
                <TriangleAlert size={17} color={w.color} />
                <div>
                  <div className="t">{w.title}</div>
                  <div className="d">{w.desc}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* positions */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="sectit">Positions</div>
        <div className="overflow-x-auto">
          <table className="v-table postable">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                <th>Class</th>
                <th className="r">Invested</th>
                <th className="r">Value</th>
                <th className="r">Unrealized</th>
                <th className="r">ROI</th>
              </tr>
            </thead>
            <tbody>
              {a.symbols.map((s) => (
                <tr key={s.symbol}>
                  <td className="mono">
                    <b>{s.symbol}</b>
                  </td>
                  <td className="nm2">{s.name}</td>
                  <td>
                    <span className="tag2">
                      <span className="dot" style={{ background: s.color }} />
                      {ASSET_CLASSES[s.assetClass].label}
                    </span>
                  </td>
                  <td className="r mono">{fmtUSD(s.costBasis)}</td>
                  <td className="r mono">{fmtUSD(s.value)}</td>
                  <td className={"r mono " + (s.unrealized >= 0 ? "pos" : "neg")}>
                    {s.unrealized >= 0 ? "+" : "−"}
                    {fmtUSD(Math.abs(s.unrealized))}
                  </td>
                  <td className={"r mono " + (s.roi >= 0 ? "pos" : "neg")}>
                    {s.roi >= 0 ? "+" : "−"}
                    {Math.abs(s.roi).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
