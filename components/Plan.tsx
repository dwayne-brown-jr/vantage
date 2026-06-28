"use client";

import { useEffect, useMemo, useState } from "react";

import { RefreshCw, Scale, Sparkles } from "lucide-react";

import { projectRsu, targetGaps, type PortfolioAnalysis } from "@/lib/analytics";
import { COMFORT_CEILING, DEFAULT_TARGETS } from "@/lib/constants";
import { fmtPct, fmtUSD } from "@/lib/format";
import { enrichPlan, type Plan as PlanResult } from "@/lib/plan";
import { computeRebalance } from "@/lib/rebalance";
import { LONG_TERM_RATE, SHORT_TERM_RATE, trimTax } from "@/lib/tax";
import type { Holding } from "@/lib/types";
import PlanCards from "@/components/PlanCards";

const TARGETS_KEY = "vantage_targets";
const RSU_KEY = "vantage_rsu";
const TAX_KEY = "vantage_tax";

interface RsuInputs {
  trim: number;
  vest: number;
  sellVests: boolean;
  ceiling: number;
}
const DEFAULT_RSU: RsuInputs = { trim: 1500, vest: 3000, sellVests: true, ceiling: COMFORT_CEILING };

interface TaxInputs {
  trim: number;
  gainPct: number;
  longTerm: boolean;
  capGainsRate: number;
  stateRate: number;
  taxAdvantaged: boolean;
}

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

export default function Plan({ a, holdings }: { a: PortfolioAnalysis; holdings: Holding[] }) {
  const [targets, setTargets] = useStored<Record<string, number>>(TARGETS_KEY, DEFAULT_TARGETS);
  const [rsu, setRsu] = useStored<RsuInputs>(RSU_KEY, DEFAULT_RSU);

  const gaps = targetGaps(a.buckets, targets, a.total);

  // One-click rebalance: instant deterministic plan, optionally refined by AI.
  const [rebalance, setRebalance] = useState<PlanResult | null>(null);
  const [aiPlan, setAiPlan] = useState<PlanResult | null>(null);
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);

  function runRebalance() {
    setAiPlan(null);
    setRefineError(null);
    setRebalance(enrichPlan(computeRebalance(holdings, a, targets), holdings));
  }

  async function refineWithAi() {
    if (refining) return;
    setRefining(true);
    setRefineError(null);
    try {
      const instruction =
        "Rebalance the portfolio to hit these exact target percentages: " +
        Object.entries(targets)
          .map(([k, v]) => `${k} ${v}%`)
          .join(", ") +
        ". Give the tax-optimal, account-by-account moves to reach them — prefer tax-free Roth/401(k) trims, bonds in tax-deferred, international in the Roth.";
      const res = await fetch("/api/strategist/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const body = (await res.json().catch(() => null)) as { plan?: PlanResult; error?: string } | null;
      if (!res.ok || !body?.plan) throw new Error(body?.error ?? `Request failed (${res.status})`);
      setAiPlan(body.plan);
    } catch (e) {
      setRefineError(e instanceof Error ? e.message : "Couldn't refine the plan. Try again in a moment.");
    } finally {
      setRefining(false);
    }
  }

  const shownPlan = aiPlan ?? rebalance;

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

  // Prefill the unrealized gain from the TSLA position (RSU basis ≈ value → ~0).
  const tslaSym = a.symbols.find((s) => s.symbol === "TSLA");
  const tslaGainPct =
    tslaSym && tslaSym.value > 0 ? Math.max(0, ((tslaSym.value - tslaSym.costBasis) / tslaSym.value) * 100) : 0;

  const [tax, setTax] = useStored<TaxInputs>(TAX_KEY, {
    trim: 1500,
    gainPct: Math.round(tslaGainPct * 10) / 10,
    longTerm: true,
    capGainsRate: LONG_TERM_RATE,
    stateRate: 0,
    taxAdvantaged: false,
  });
  const taxResult = trimTax({
    trimAmount: tax.trim,
    gainPct: tax.gainPct,
    capGainsRate: tax.capGainsRate,
    stateRate: tax.stateRate,
    taxAdvantaged: tax.taxAdvantaged,
  });
  const setLongTerm = (longTerm: boolean) =>
    setTax({ ...tax, longTerm, capGainsRate: longTerm ? LONG_TERM_RATE : SHORT_TERM_RATE });

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
        <div className="sectit">One-click rebalance — get a strategy to hit your targets</div>
        <div className="rebar">
          <button type="button" className="planbtn" onClick={runRebalance}>
            <Scale size={15} /> Rebalance to my targets
          </button>
          {shownPlan && !aiPlan && (
            <button type="button" className="planbtn ghost" onClick={() => void refineWithAi()} disabled={refining}>
              {refining ? <RefreshCw size={15} className="spin" /> : <Sparkles size={15} />}
              {refining ? "Refining…" : "Refine with AI (tax-aware routing)"}
            </button>
          )}
          <span className="rebar-hint">
            {aiPlan
              ? "AI-refined strategy"
              : rebalance
                ? "Instant strategy — refine for tax-aware account routing"
                : "Instant math, then optionally refine with AI"}
          </span>
        </div>

        {refineError && (
          <div className="disc" style={{ color: "var(--red)" }} role="alert">
            {refineError}
          </div>
        )}

        {!shownPlan && (
          <div className="disc">
            Computes exactly which holdings to sell and where to redeploy to reach your target mix above — instantly, from
            your own numbers. Then refine with the strategist for tax-optimal account routing.
          </div>
        )}

        {shownPlan && (
          <div className="rebal-result">
            <PlanCards plan={shownPlan} />
          </div>
        )}
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

      <div className="card" style={{ marginTop: 18 }}>
        <div className="sectit">Tax-aware trim — what diversifying actually costs</div>
        <div className="controls">
          <div className="ctl">
            <label htmlFor="tax-trim">Amount of Tesla to trim</label>
            <div className="ig">
              <span>$</span>
              <input
                id="tax-trim"
                type="number"
                step={500}
                value={tax.trim}
                onChange={(e) => setTax({ ...tax, trim: Math.max(0, parseFloat(e.target.value) || 0) })}
              />
            </div>
          </div>
          <div className="ctl">
            <label htmlFor="tax-gain">Unrealized gain on the position</label>
            <div className="ig">
              <input
                id="tax-gain"
                type="number"
                step={1}
                value={tax.gainPct}
                onChange={(e) => setTax({ ...tax, gainPct: Math.max(0, parseFloat(e.target.value) || 0) })}
              />
              <span>%</span>
            </div>
          </div>
          <div className="ctl">
            <label htmlFor="tax-rate">Capital-gains rate ({tax.longTerm ? "long-term + NIIT" : "short-term / ordinary"})</label>
            <div className="ig">
              <input
                id="tax-rate"
                type="number"
                step={0.1}
                value={tax.capGainsRate}
                onChange={(e) => setTax({ ...tax, capGainsRate: Math.max(0, parseFloat(e.target.value) || 0) })}
              />
              <span>%</span>
            </div>
          </div>
          <div className="ctl">
            <label htmlFor="tax-state">State tax rate</label>
            <div className="ig">
              <input
                id="tax-state"
                type="number"
                step={0.1}
                value={tax.stateRate}
                onChange={(e) => setTax({ ...tax, stateRate: Math.max(0, parseFloat(e.target.value) || 0) })}
              />
              <span>%</span>
            </div>
          </div>
          <div className="ctl">
            <label>Holding period</label>
            <button type="button" className="toggle" aria-pressed={tax.longTerm} onClick={() => setLongTerm(!tax.longTerm)}>
              <span className={"tg" + (tax.longTerm ? " on" : "")}>
                <b />
              </span>
              {tax.longTerm ? "Long-term (>1yr)" : "Short-term (<1yr)"}
            </button>
          </div>
          <div className="ctl">
            <label>Held in Roth / 401(k)?</label>
            <button
              type="button"
              className="toggle"
              aria-pressed={tax.taxAdvantaged}
              onClick={() => setTax({ ...tax, taxAdvantaged: !tax.taxAdvantaged })}
            >
              <span className={"tg" + (tax.taxAdvantaged ? " on" : "")}>
                <b />
              </span>
              {tax.taxAdvantaged ? "Tax-free to rebalance" : "Taxable account"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Realized gain" value={fmtUSD(taxResult.realizedGain)} />
          <Stat label="Estimated tax" value={fmtUSD(taxResult.tax)} tone="neg" />
          <Stat label="Net to diversify" value={fmtUSD(taxResult.net)} tone="pos" />
          <Stat label="Effective rate" value={fmtPct(taxResult.effectiveRate)} />
        </div>

        <div className="verdict">
          {tax.taxAdvantaged ? (
            <>
              Inside a Roth or 401(k), trimming <b>{fmtUSD(tax.trim)}</b> of Tesla is <b>tax-free</b> — every dollar
              redeploys. This is exactly why rebalancing the tax-advantaged accounts first is the cheapest path to
              diversify.
            </>
          ) : (
            <>
              Trimming <b>{fmtUSD(tax.trim)}</b> realizes <b>{fmtUSD(taxResult.realizedGain)}</b> in gains and costs about{" "}
              <b>{fmtUSD(taxResult.tax)}</b> in tax (<b>{fmtPct(taxResult.effectiveRate)}</b> effective), leaving{" "}
              <b>{fmtUSD(taxResult.net)}</b> to diversify. Rebalancing the same amount inside your Roth would be tax-free.
            </>
          )}
        </div>
        <div className="disc">
          Educational estimate, not tax advice — it taxes only the gain portion at the rate you enter (long-term
          defaults to 15% + 3.8% NIIT). Your real cost basis (vest-date price for RSUs), tax bracket, and state rules
          determine the actual bill. Selling RSUs right at vest usually has little gain; gains accrue as the price rises
          afterward.
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-2xl border border-line bg-surface2 p-4">
      <div className="text-[11px] uppercase tracking-[0.12em] text-faint">{label}</div>
      <div className={`mono mt-1.5 text-2xl font-medium ${tone === "pos" ? "text-green" : tone === "neg" ? "text-red" : "text-txt"}`}>
        {value}
      </div>
    </div>
  );
}
