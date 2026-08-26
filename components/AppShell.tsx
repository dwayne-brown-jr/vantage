"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { LogOut } from "lucide-react";

import ChartTab from "@/components/ChartTab";
import History from "@/components/History";
import Holdings from "@/components/Holdings";
import Overview from "@/components/Overview";
import Plan from "@/components/Plan";
import Strategist from "@/components/Strategist";
import { useToast } from "@/components/Toast";
import { createHolding, deleteHolding, refreshPrices, updateHolding } from "@/lib/api";
import { analyze } from "@/lib/analytics";
import { fmtUSD } from "@/lib/format";
import { proposalPatch, type ReconcileProposal } from "@/lib/reconcile";
import type { Holding, HoldingInput } from "@/lib/types";

/** Refresh automatically when the last fetch was longer ago than this. */
const STALE_AFTER_MS = 15 * 60 * 1000;

/**
 * When THIS browser last fetched quotes.
 *
 * Deliberately not derived from a holding's `updatedAt`: that carries the
 * market's timestamp for the price, not the moment we asked for it. Outside
 * trading hours the market stamp is always hours old, so a staleness gate
 * built on it would re-fetch on every single page load — the exact hammering
 * the gate exists to prevent.
 */
const LAST_FETCH_KEY = "vantage:lastPriceFetch";

function readLastFetch(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(LAST_FETCH_KEY);
  const t = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(t) ? t : 0;
}

function writeLastFetch(): void {
  if (typeof window !== "undefined") window.localStorage.setItem(LAST_FETCH_KEY, new Date().toISOString());
}

/** "just now" / "12 minutes ago" / "at 3:41 PM" — never a bare timestamp. */
function freshness(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const sameDay = new Date(iso).toDateString() === new Date().toDateString();
  if (sameDay) return `at ${new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type Tab = "overview" | "holdings" | "chart" | "plan" | "history" | "strategist";

const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["holdings", "Holdings"],
  ["chart", "Chart"],
  ["plan", "Plan"],
  ["history", "History"],
  ["strategist", "Strategist"],
];

export default function AppShell({
  initialHoldings,
  authEnabled = false,
}: {
  initialHoldings: Holding[];
  authEnabled?: boolean;
}) {
  const [holdings, setHoldings] = useState<Holding[]>(initialHoldings);
  const [tab, setTab] = useState<Tab>("holdings");
  const [error, setError] = useState<string | null>(null);
  // Derive the initial "prices as of" from the last live-priced update so the
  // topbar stays honest across reloads (not just within a session).
  const initialPriceAsOf =
    initialHoldings
      .filter((h) => h.price != null && (h.quantity ?? 0) > 0 && h.updatedAt)
      .map((h) => h.updatedAt as string)
      .sort()
      .at(-1) ?? null;
  const [pricesAsOf, setPricesAsOf] = useState<string | null>(initialPriceAsOf);
  const [priceNote, setPriceNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  /** Guards the on-open refresh so React's dev double-mount fires it once. */
  const autoRan = useRef(false);

  const a = useMemo(() => analyze(holdings), [holdings]);

  /**
   * Fetch live quotes and recompute values from share counts.
   *
   * `silent` is for the automatic refresh on open: it still updates the
   * figures and surfaces failures, but skips the success toast. A toast the
   * user did not ask for, on every single page load, is noise — and once it is
   * noise they stop reading the ones that matter.
   */
  async function onRefreshPrices(estimateShares = false, silent = false) {
    setRefreshing(true);
    setError(null);
    try {
      const r = await refreshPrices(estimateShares);
      setHoldings(r.holdings);
      setPricesAsOf(r.asOf);
      writeLastFetch();
      const parts: string[] = [];
      if (r.valueUpdated.length) parts.push(`${r.valueUpdated.length} priced`);
      if (r.unresolved.length)
        parts.push(`${r.unresolved.length} manual (${r.unresolved.slice(0, 3).join(", ")}${r.unresolved.length > 3 ? "…" : ""})`);
      setPriceNote(parts.join(" · ") || "no live-priced holdings yet");
      if (silent) return;
      toast({
        message: estimateShares
          ? `Estimated shares and priced ${r.valueUpdated.length} holdings`
          : `Prices updated — ${r.valueUpdated.length} live, ${r.unresolved.length} manual`,
        tone: "ok",
      });
    } catch (e) {
      // Failures are surfaced even when silent — quietly showing stale figures
      // as though they were current is the one outcome worth interrupting for.
      setError(e instanceof Error ? e.message : "Price refresh failed.");
      toast({ message: "Couldn't reach the price provider", tone: "error" });
    } finally {
      setRefreshing(false);
    }
  }

  /**
   * Refresh prices when the app is opened, and again when a long-idle tab is
   * brought back to the front.
   *
   * Gated on staleness rather than firing unconditionally: repeatedly
   * reloading would otherwise hammer the quote provider for prices that have
   * not moved. A side benefit is that opening the app records a daily
   * snapshot, which is what the growth history is built from.
   */
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;

    const refreshIfStale = () => {
      if (document.visibilityState !== "visible") return;
      const last = readLastFetch();
      if (last && Date.now() - last < STALE_AFTER_MS) return;
      void onRefreshPrices(false, true);
    };

    refreshIfStale();
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => document.removeEventListener("visibilitychange", refreshIfStale);
    // Runs once; the handler reads the latest as-of through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  /** Local-only update for instant recompute while typing. */
  function onLive(id: string, patch: Partial<HoldingInput>) {
    setHoldings((hs) => hs.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  }

  /** Persist a change; reconcile with the server's canonical row. */
  async function onCommit(id: string, patch: Partial<HoldingInput>) {
    onLive(id, patch);
    try {
      const saved = await updateHolding(id, patch);
      setHoldings((hs) => hs.map((h) => (h.id === id ? saved : h)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save change.");
    }
  }

  async function onAdd(account: string) {
    setError(null);
    try {
      const created = await createHolding({
        account,
        symbol: "NEW",
        name: "New position",
        value: 0,
        costBasis: 0,
        assetClass: "us_stock",
      });
      setHoldings((hs) => [...hs, created]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add position.");
    }
  }

  /**
   * Apply one owner-approved ledger correction from a reconciled attachment.
   * Returns false if the write failed so the card can show it, and offers Undo
   * back to the exact prior figures — nothing here is silent.
   */
  async function onApplyReconcile(p: ReconcileProposal): Promise<boolean> {
    const patch = proposalPatch(p);
    try {
      if (p.holdingId) {
        const before = holdings.find((h) => h.id === p.holdingId);
        const saved = await updateHolding(p.holdingId, { ...patch, source: "reconciled" });
        setHoldings((hs) => hs.map((h) => (h.id === saved.id ? saved : h)));
        toast({
          message: `${p.symbol} updated`,
          action: before
            ? {
                label: "Undo",
                onClick: () => {
                  void (async () => {
                    const reverted = await updateHolding(before.id, {
                      value: before.value,
                      costBasis: before.costBasis,
                      quantity: before.quantity ?? null,
                      source: before.source ?? "manual",
                    });
                    setHoldings((hs) => hs.map((h) => (h.id === reverted.id ? reverted : h)));
                  })();
                },
              }
            : undefined,
        });
      } else {
        const created = await createHolding({
          account: p.account,
          symbol: p.symbol,
          name: p.name,
          value: patch.value ?? 0,
          costBasis: patch.costBasis ?? 0,
          assetClass: p.assetClass,
          quantity: patch.quantity ?? null,
          source: "reconciled",
        });
        setHoldings((hs) => [...hs, created]);
        toast({
          message: `${p.symbol} added`,
          action: { label: "Undo", onClick: () => void onDelete(created.id) },
        });
      }
      return true;
    } catch (e) {
      toast({ message: `Couldn't update ${p.symbol}`, tone: "error" });
      setError(e instanceof Error ? e.message : "Failed to apply the change.");
      return false;
    }
  }

  /** Restore a deleted holding (Undo), keeping its original id. */
  async function restore(h: Holding) {
    setHoldings((hs) => (hs.some((x) => x.id === h.id) ? hs : [...hs, h]));
    try {
      await createHolding(h);
    } catch {
      toast({ message: "Couldn't undo the delete", tone: "error" });
    }
  }

  async function onDelete(id: string) {
    const victim = holdings.find((h) => h.id === id);
    const prev = holdings;
    setHoldings((hs) => hs.filter((h) => h.id !== id)); // optimistic
    try {
      await deleteHolding(id);
      if (victim)
        toast({ message: `Deleted ${victim.symbol}`, action: { label: "Undo", onClick: () => void restore(victim) } });
    } catch (e) {
      setHoldings(prev); // revert on failure
      toast({ message: "Couldn't delete that position", tone: "error" });
      setError(e instanceof Error ? e.message : "Failed to delete position.");
    }
  }

  function onImported(next: Holding[], summary: { created: number; updated: number }) {
    // The server upserts by (account, symbol) and returns the full set — replace,
    // don't append, so refreshed positions aren't duplicated in the UI.
    setHoldings(next);
    const parts = [
      summary.created > 0 ? `added ${summary.created}` : "",
      summary.updated > 0 ? `refreshed ${summary.updated}` : "",
    ].filter(Boolean);
    toast({ message: `Import complete — ${parts.join(" · ") || "no changes"}`, tone: "ok" });
  }

  return (
    <div className="vt wrap">
      <header className="topbar">
        <div className="brand">
          <span className="mark">
            Vant<b>a</b>ge
          </span>
          <span className="tagline">Personal portfolio desk</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          {/* The balance leads; how fresh it is follows in words, not a bare
              lowercase timestamp a client has to decode. */}
          <span className="asof">
            <span className="mono" style={{ color: "var(--txt)", fontSize: 13 }}>{fmtUSD(a.total)}</span>
            <span style={{ marginLeft: 8 }}>
              {refreshing ? "updating…" : pricesAsOf ? `updated ${freshness(pricesAsOf)}` : "values entered by hand"}
            </span>
          </span>
          {authEnabled && (
            <button
              onClick={() => void signOut()}
              className="asof"
              aria-label="Sign out"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--faint)",
              }}
            >
              <LogOut size={12} /> Sign out
            </button>
          )}
        </div>
      </header>

      <nav className="nav" aria-label="Sections">
        {TABS.map(([t, label]) => (
          <button key={t} className={tab === t ? "on" : ""} aria-current={tab === t} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="card mb-[18px]" style={{ borderColor: "var(--red)" }} role="alert">
          <span className="text-sm text-red">{error}</span>
        </div>
      )}

      {tab === "overview" && <Overview a={a} />}
      {tab === "holdings" && (
        <Holdings
          holdings={holdings}
          onLive={onLive}
          onCommit={onCommit}
          onAdd={onAdd}
          onDelete={onDelete}
          onImported={onImported}
          onRefreshPrices={onRefreshPrices}
          refreshing={refreshing}
          pricesAsOf={pricesAsOf}
          priceNote={priceNote}
        />
      )}
      {tab === "chart" && <ChartTab symbols={a.symbols.map((s) => ({ symbol: s.symbol, name: s.name }))} />}
      {tab === "plan" && <Plan a={a} holdings={holdings} />}
      {tab === "history" && <History a={a} />}
      {tab === "strategist" && <Strategist a={a} onApplyReconcile={onApplyReconcile} />}
    </div>
  );
}
