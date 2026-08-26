"use client";

import { TriangleAlert } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import Donut from "@/components/Donut";
import GrowthIncome from "@/components/GrowthIncome";
import KpiStrip from "@/components/KpiStrip";
import type { PortfolioAnalysis } from "@/lib/analytics";
import { ASSET_CLASSES, COMFORT_CEILING } from "@/lib/constants";
import { fmtPct, fmtUSD } from "@/lib/format";

const tooltipProps = {
  contentStyle: {
    background: "#272e3a",
    border: "1px solid #38414f",
    borderRadius: 8,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
  },
  itemStyle: { color: "#f0ece3" },
  labelStyle: { color: "#a0a7b3" },
  cursor: { fill: "rgba(255,255,255,0.04)" },
} as const;

const xAxisProps = {
  tick: { fill: "#a0a7b3", fontSize: 10 },
  axisLine: { stroke: "#38414f" },
  tickLine: false,
} as const;

const yAxisProps = {
  tick: { fill: "#6f7784", fontSize: 10 },
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
      color: "#d96b6b",
      title: "Too much riding on Tesla",
      desc: `${fmtPct(a.tsla.pct)} of your money is in one stock, against a target of about ${COMFORT_CEILING}% — and your salary, benefits, and future RSUs all come from the same company.`,
    });
  } else if (a.tslaUnvested > 0 && a.tslaExposurePct > COMFORT_CEILING) {
    // Held TSLA is within tolerance, but unvested RSUs will vest into more of
    // it — the risk is ahead, not behind, and is invisible from the held line.
    items.push({
      color: "#e89b6c",
      title: `Tesla is ${fmtPct(a.tsla?.pct ?? 0)} of holdings, but ${fmtPct(a.tslaExposurePct)} of your Tesla-linked wealth`,
      desc: `${fmtUSD(a.tslaUnvested)} of unvested RSUs will vest into TSLA and push the held share back up unless they are sold as they land. Salary and benefits ride on the same company.`,
    });
  }

  // Any other single name above the comfort ceiling.
  for (const s of a.singles) {
    if (s.symbol !== "TSLA" && s.pct > COMFORT_CEILING) {
      items.push({
        color: "#e89b6c",
        title: `${s.symbol} is also a large single holding at ${fmtPct(s.pct)}`,
        desc: `A second position worth ${fmtUSD(s.value)} that is larger than the ${COMFORT_CEILING}% you are aiming for.`,
      });
    }
  }

  if (a.intlPct < 15) {
    items.push({
      color: "#e89b6c",
      title: `Only ${fmtPct(a.intlPct)} is invested outside the US`,
      desc: "Nearly all of that comes from your target-date fund. Adding more international — ideally inside the Roth, where it costs nothing to rebalance — is the simplest fix.",
    });
  }

  if (a.specTotal > 0) {
    items.push({
      color: "#8b9fb6",
      title: `${fmtUSD(a.specTotal)} in high-risk holdings`,
      desc: "These add fees and swing harder than the market without spreading your risk any wider. Worth considering clearing out.",
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

      {/* Growth over the snapshot history + trailing dividend income. */}
      <div className="mb-[18px]">
        <GrowthIncome />
      </div>

      {/* allocation donuts */}
      <div className="grid3">
        {/* Only the first ring carries the total; repeating it three times
            across one row invites reading them as different figures. */}
        <Donut title="What you own" data={a.byClass} groupBelowPct={2} />
        <Donut title="Where your money is invested" data={a.buckets} showTotal={false} />
        <Donut title="Which accounts hold it" data={acctData} showTotal={false} />
      </div>

      {/* One chart, not three: "unrealized by holding" and "ROI by holding"
          restated this same data, and both already exist as columns in the
          Positions table below. */}
      <div className="mb-[18px]">
        <div className="card">
          <div className="sectit">What you paid vs. what it&rsquo;s worth</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={top} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <XAxis dataKey="symbol" {...xAxisProps} interval={0} angle={-35} textAnchor="end" height={46} />
              <YAxis {...yAxisProps} tickFormatter={(v) => "$" + Math.round(Number(v) / 1000) + "k"} />
              <Tooltip
                {...tooltipProps}
                formatter={(v, n) => [fmtUSD(Number(v)), n === "costBasis" ? "You paid" : "Worth now"]}
              />
              <Bar dataKey="costBasis" name="costBasis" fill="#8b9fb6" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="value" name="value" fill="#e0b544" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* concentration hero + watch items */}
      <div className="cols">
        <div className="card">
          <div className="sectit">How much is in one stock</div>
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
                <span>target ~{COMFORT_CEILING}%</span>
              </div>
            </div>
            {a.tslaUnvested > 0 && (
              <div className="exposure">
                <span className="exp-label">Counting RSUs you haven&rsquo;t received yet</span>
                <span className="exp-value mono">{fmtPct(a.tslaExposurePct)}</span>
                <span className="exp-note">
                  {fmtUSD(a.tslaUnvested)}{" "}
                  unvested isn&apos;t counted in your portfolio — you don&apos;t own it yet — but it is Tesla exposure,
                  and it vests into more of it.
                </span>
              </div>
            )}
            <div className="meternote">
              {a.tsla && a.tsla.pct > COMFORT_CEILING ? "A third of your portfolio is one stock" : "This is your largest single-name position"}{" "}
              — <b>and Tesla also signs your paycheck</b>, funds your benefits, and is the source of these RSUs. The
              Plan tab projects how selling vests brings this down.
            </div>
          </div>
        </div>

        <div className="card flags">
          <div className="sectit">Things to keep an eye on</div>
          {watch.length === 0 ? (
            <p className="text-sm text-muted">Nothing to flag — your mix looks balanced.</p>
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
        <div className="sectit">Everything you hold</div>
        <div className="overflow-x-auto">
          <table className="v-table postable">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Type</th>
                <th className="r">You paid</th>
                <th className="r">Worth now</th>
                <th className="r">Gain / loss</th>
                <th className="r">Gain %</th>
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
