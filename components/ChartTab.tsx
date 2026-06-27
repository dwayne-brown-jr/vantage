"use client";

import { useEffect, useRef, useState } from "react";

import { Sparkles } from "lucide-react";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";

import { useToast } from "@/components/Toast";
import { fetchChartInsight, fetchPriceHistory, type PriceHistory } from "@/lib/api";
import type { Candle } from "@/lib/datasource";
import { fmtPct } from "@/lib/format";

const RANGES = ["6mo", "1y", "2y"] as const;
const RANGE_LABEL: Record<string, string> = { "6mo": "6M", "1y": "1Y", "2y": "2Y" };

const usd = (n: number | null | undefined): string =>
  n == null ? "—" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Per-bar simple moving average series for the chart overlay. */
function smaSeries(candles: Candle[], period: number): { time: UTCTimestamp; value: number }[] {
  if (candles.length < period) return [];
  const out: { time: UTCTimestamp; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i]!.close;
    if (i >= period) sum -= candles[i - period]!.close;
    if (i >= period - 1) out.push({ time: candles[i]!.time as UTCTimestamp, value: sum / period });
  }
  return out;
}

export default function ChartTab({ symbols }: { symbols: { symbol: string; name: string }[] }) {
  const initial = symbols.find((s) => s.symbol === "TSLA")?.symbol ?? symbols[0]?.symbol ?? "TSLA";
  const [symbol, setSymbol] = useState(initial);
  const [range, setRange] = useState<string>("1y");
  const [data, setData] = useState<PriceHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Load history when symbol/range changes.
  useEffect(() => {
    let on = true;
    setLoading(true);
    setInsight(null);
    fetchPriceHistory(symbol, range)
      .then((d) => on && setData(d))
      .catch(() => on && setData({ symbol, candles: [], technicals: null, note: "Could not load history." }))
      .finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
  }, [symbol, range]);

  // Build the chart whenever data changes.
  useEffect(() => {
    if (!data || data.candles.length === 0 || !containerRef.current) return;
    const el = containerRef.current;
    let cancelled = false;
    let cleanup = () => {};

    void (async () => {
      const LWC = await import("lightweight-charts");
      if (cancelled || !el.isConnected) return;
      const chart: IChartApi = LWC.createChart(el, {
        width: el.clientWidth,
        height: 380,
        layout: {
          background: { type: LWC.ColorType.Solid, color: "transparent" },
          textColor: "#8A8F99",
          fontFamily: "'IBM Plex Mono', monospace",
        },
        grid: { vertLines: { color: "rgba(38,44,54,0.55)" }, horzLines: { color: "rgba(38,44,54,0.55)" } },
        rightPriceScale: { borderColor: "#262C36" },
        timeScale: { borderColor: "#262C36", timeVisible: false },
        crosshair: { mode: LWC.CrosshairMode.Normal },
      });

      const candle = chart.addSeries(LWC.CandlestickSeries, {
        upColor: "#5FA37E",
        downColor: "#C75D5D",
        wickUpColor: "#5FA37E",
        wickDownColor: "#C75D5D",
        borderVisible: false,
      });
      candle.setData(
        data.candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
      );

      const vol = chart.addSeries(LWC.HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" } });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
      vol.setData(
        data.candles.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? "rgba(95,163,126,0.35)" : "rgba(199,93,93,0.35)",
        })),
      );

      const sma50 = smaSeries(data.candles, 50);
      if (sma50.length) {
        const s = chart.addSeries(LWC.LineSeries, { color: "#CDA434", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData(sma50);
      }
      const sma200 = smaSeries(data.candles, 200);
      if (sma200.length) {
        const s = chart.addSeries(LWC.LineSeries, { color: "#6E8BB0", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData(sma200);
      }

      const t = data.technicals;
      if (t) {
        candle.createPriceLine({ price: t.buyZone[1], color: "#5FA37E", lineWidth: 1, lineStyle: LWC.LineStyle.Dashed, title: "buy zone" });
        candle.createPriceLine({ price: t.buyZone[0], color: "#5FA37E", lineWidth: 1, lineStyle: LWC.LineStyle.Dashed, axisLabelVisible: true });
      }

      // Size to the container and show ALL bars. Using an explicit logical
      // range (not fitContent) is robust against a stale pre-layout width.
      const lastIdx = data.candles.length - 1;
      const fit = () => {
        chart.applyOptions({ width: el.clientWidth });
        chart.timeScale().setVisibleLogicalRange({ from: 0, to: lastIdx });
      };
      fit();
      requestAnimationFrame(fit);
      const ro = new ResizeObserver(fit);
      ro.observe(el);
      cleanup = () => {
        ro.disconnect();
        chart.remove();
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [data]);

  async function getInsight() {
    if (!data?.technicals) return;
    setInsightLoading(true);
    try {
      const name = symbols.find((s) => s.symbol === symbol)?.name;
      setInsight(await fetchChartInsight({ symbol, name, technicals: data.technicals }));
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "Analysis failed", tone: "error" });
    } finally {
      setInsightLoading(false);
    }
  }

  const t = data?.technicals ?? null;
  const noData = data != null && data.candles.length === 0;

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            className="v-select"
            style={{ fontSize: 14, fontWeight: 700, padding: "7px 10px" }}
            value={symbol}
            aria-label="Symbol"
            onChange={(e) => setSymbol(e.target.value)}
          >
            {symbols.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol}
              </option>
            ))}
          </select>
          {t && (
            <span className="mono text-sm">
              {usd(t.last)}{" "}
              <span style={{ color: t.changePct >= 0 ? "var(--green)" : "var(--red)" }}>
                {t.changePct >= 0 ? "+" : ""}
                {t.changePct.toFixed(2)}%
              </span>
            </span>
          )}
        </div>
        <div className="nav" style={{ marginBottom: 0 }}>
          {RANGES.map((r) => (
            <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-muted">Loading {symbol}…</p>}
      {noData && (
        <p className="text-sm text-muted">
          No price history for {symbol} (collective/institutional funds have no public ticker). Try a listed stock, ETF,
          or mutual fund.
        </p>
      )}

      <div ref={containerRef} style={{ width: "100%", height: data && !noData ? 380 : 0 }} />

      {t && (
        <>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            <span>
              50-day MA <span className="mono" style={{ color: "var(--gold)" }}>{usd(t.sma50)}</span>
            </span>
            <span>
              200-day MA <span className="mono" style={{ color: "var(--blue)" }}>{usd(t.sma200)}</span>
            </span>
            <span>
              RSI <span className="mono">{t.rsi14 != null ? t.rsi14.toFixed(0) : "—"}</span>
              {t.rsi14 != null && t.rsi14 < 30 && <span style={{ color: "var(--green)" }}> oversold</span>}
              {t.rsi14 != null && t.rsi14 > 70 && <span style={{ color: "var(--red)" }}> overbought</span>}
            </span>
            <span>
              Range <span className="mono">{usd(t.rangeLow)}–{usd(t.rangeHigh)}</span>
            </span>
            <span>
              Buy zone{" "}
              <span className="mono" style={{ color: "var(--green)" }}>
                {usd(t.buyZone[0])}–{usd(t.buyZone[1])}
              </span>
            </span>
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="sectit" style={{ margin: 0 }}>
                AI buy-zone read
              </div>
              <button className="btn-ghost" disabled={insightLoading} onClick={() => void getInsight()}>
                <Sparkles size={14} /> {insightLoading ? "Reading…" : insight ? "Re-analyze" : "Analyze"}
              </button>
            </div>
            {insight ? (
              <p className="bubble" style={{ fontSize: 13.5 }}>
                {insight}
              </p>
            ) : (
              <p className="text-xs text-faint">
                Get a candid read on where {symbol} could be reasonable to accumulate — grounded only in the levels
                computed above (moving averages, RSI, Fibonacci retracement). Educational, not advice.
              </p>
            )}
          </div>
          <div className="disc">
            Levels are computed deterministically from price history; the AI only narrates them. Technical levels are not
            predictions — they break. Not investment advice. Chart data may be swapped to Schwab's official feed once
            connected.
          </div>
        </>
      )}
    </div>
  );
}
