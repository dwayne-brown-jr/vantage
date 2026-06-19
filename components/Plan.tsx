"use client";

import { useEffect, useMemo, useState } from "react";

import { projectRsu, targetGaps, type PortfolioAnalysis } from "@/lib/analytics";
import { COMFORT_CEILING, DEFAULT_TARGETS } from "@/lib/constants";
import { fmtPct, fmtUSD } from "@/lib/format";

const TARGETS_KEY = "vantage_targets";
const RSU_KEY = "vantage_rsu";

interface RsuInputs {
  trim: number;
  vest: number;
  sellVests: boolean;
  ceiling: number;
}
const DEFAULT_RSU: RsuInputs = { trim: 1500, vest: 3000, sellVests: true, ceiling: COMFORT_CEILING };

/** Load a JSON value from localStorage, merged over a default. */
function useStored<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue({ ...fallback, ...(JSON.parse(raw) as Partial<T>) });
    } catch {
      /* ignore malformed storage */
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota errors */
    }
  }, [key, value, loaded]);

  return [value, setValue];
}

export default function Plan({ a }: { a: PortfolioAnalysis }) {
  const [targets, setTargets] = useStored<Record<string, number>>(TARGETS_KEY, DEFAULT_TARGETS);
  const [rsu, setRsu] = useStored<RsuInputs>(RSU_KEY, DEFAULT_RSU);

  const gaps = targetGaps(a.buckets, targets, a.total);

  const proj = useMemo(
    () =>
      projectRsu({
        startTslaValue: a.tsla?.value ?? 0,
        startTotal: a.total,
        trimPerQuarter: rsu.trim,
        vestPerQuarter: rsu.vest,
        sellVests: rsu.sellVests,
        ceilingPct: rsu.ceiling,
      }),
    [a.tsla?.value, a.total, rsu],
  );

  const maxPct = Math.max(...proj.points.map((p) => p.pct), rsu.ceiling) * 1.12 || 1;

  return (
    <>
      <div className="card">
        <div className="sectit">Target vs. actual — the gap to close</div>
        {gaps.map((g, i) => (
          <div className="tgtrow" key={g.label}>
            <div className="tgthead">
              <span>{g.label}</span>
              <span className="rt">
                <span className="mono">{fmtPct(g.actualPct)} now</span>
                <span style={{ color: "var(--faint)" }}>→</span>
                <input
                  type="number"
                  aria-label={`${g.label} target percent`}
                  value={targets[g.label] ?? 0}
                  onChange={(e) => setTargets({ ...targets, [g.label]: parseFloat(e.target.value) || 0 })}
                />
                <span style={{ color: "var(--faint)" }}>%</span>
              </span>
            </div>
            <div className="tgtbar">
              <div
                className="tgtfill"
                style={{ width: Math.min(100, g.actualPct) + "%", background: a.buckets[i]?.color }}
              />
              <div className="tick" style={{ left: Math.min(100, g.targetPct) + "%" }} />
            </div>
            <div className={"delta " + (g.onTarget ? "ok" : g.deltaDollar >= 0 ? "add" : "trim")}>
              {g.onTarget ? "on target" : g.deltaDollar >= 0 ? `add ${fmtUSD(g.deltaDollar)}` : `trim ${fmtUSD(-g.deltaDollar)}`}
            </div>
          </div>
        ))}
        <div className="disc">
          Targets are a starting point you can edit — the defaults reflect an age-appropriate, globally diversified,
          equity-heavy mix. The 2060 fund&apos;s international and bonds are counted in your actuals.
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="sectit">RSU diversification planner — your highest-leverage move</div>
        <div className="controls">
          <div className="ctl">
            <label htmlFor="rsu-trim">Trim existing TSLA each quarter</label>
            <div className="ig">
              <span>$</span>
              <input
                id="rsu-trim"
                type="number"
                step={250}
                value={rsu.trim}
                onChange={(e) => setRsu({ ...rsu, trim: Math.max(0, parseFloat(e.target.value) || 0) })}
              />
            </div>
          </div>
          <div className="ctl">
            <label htmlFor="rsu-vest">Expected RSU vesting each quarter</label>
            <div className="ig">
              <span>$</span>
              <input
                id="rsu-vest"
                type="number"
                step={500}
                value={rsu.vest}
                onChange={(e) => setRsu({ ...rsu, vest: Math.max(0, parseFloat(e.target.value) || 0) })}
              />
            </div>
          </div>
          <div className="ctl">
            <label htmlFor="rsu-ceiling">Target ceiling for Tesla</label>
            <div className="ig">
              <input
                id="rsu-ceiling"
                type="number"
                step={1}
                value={rsu.ceiling}
                onChange={(e) => setRsu({ ...rsu, ceiling: Math.max(1, parseFloat(e.target.value) || 1) })}
              />
              <span>%</span>
            </div>
          </div>
          <div className="ctl">
            <label>Sell vests as they land?</label>
            <button
              type="button"
              className="toggle"
              aria-pressed={rsu.sellVests}
              onClick={() => setRsu({ ...rsu, sellVests: !rsu.sellVests })}
            >
              <span className={"tg" + (rsu.sellVests ? " on" : "")}>
                <b />
              </span>
              {rsu.sellVests ? "Selling on vest" : "Holding vests"}
            </button>
          </div>
        </div>

        <div className="proj">
          <div className="projceil" style={{ bottom: (rsu.ceiling / maxPct) * 100 + "%" }}>
            <span>ceiling {rsu.ceiling}%</span>
          </div>
          {proj.points.map((p, i) => (
            <div className="projcol" key={i}>
              <div
                className="projbar"
                style={{
                  height: (p.pct / maxPct) * 100 + "%",
                  background:
                    p.pct <= rsu.ceiling ? "var(--green)" : "linear-gradient(180deg,var(--red),var(--orange))",
                }}
              />
            </div>
          ))}
        </div>
        <div className="projx">
          <span>now</span>
          <span>2 yrs</span>
          <span>4 yrs</span>
        </div>

        <div className="verdict">
          {proj.reachedQuarter !== null ? (
            <>
              At these amounts, Tesla falls to your <b>{rsu.ceiling}%</b> ceiling in about{" "}
              <b>{proj.reachedQuarter} quarters</b> (~{(proj.reachedQuarter / 4).toFixed(1)}
              {" "}years). Each quarter you&apos;d redirect <b>{fmtUSD(proj.redirectPerQuarter)}</b> into
              diversified holdings.
            </>
          ) : (
            <>
              At these amounts you don&apos;t reach <b>{rsu.ceiling}%</b> within 4 years — raise the quarterly trim or
              keep selling vests. You&apos;d still be redirecting <b>{fmtUSD(proj.redirectPerQuarter)}</b> per quarter.
            </>
          )}
        </div>
        <div className="disc">
          No market prediction here — growth would lift the numerator and denominator together, so the decline shown
          comes purely from your own trims plus the dilution of selling vests into diversified holdings. Mind Tesla
          trading windows and the tax on RSUs at vest.
        </div>
      </div>
    </>
  );
}
