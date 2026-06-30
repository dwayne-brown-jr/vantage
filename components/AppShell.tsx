"use client";

import { useMemo, useState } from "react";

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
import type { Holding, HoldingInput } from "@/lib/types";

type Tab = "overview" | "holdings" | "chart" | "plan" | "history" | "strategist";

const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["holdings", "Holdings"],
  ["chart", "Chart"],
  ["plan", "Plan"],
  ["history", "History"],
  ["strategist", "AI Strategist"],
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

  const a = useMemo(() => analyze(holdings), [holdings]);

  /** Fetch live quotes and recompute values from share counts. */
  async function onRefreshPrices(estimateShares = false) {
    setRefreshing(true);
    setError(null);
    try {
      const r = await refreshPrices(estimateShares);
      setHoldings(r.holdings);
      setPricesAsOf(r.asOf);
      const parts: string[] = [];
      if (r.valueUpdated.length) parts.push(`${r.valueUpdated.length} priced`);
      if (r.unresolved.length)
        parts.push(`${r.unresolved.length} manual (${r.unresolved.slice(0, 3).join(", ")}${r.unresolved.length > 3 ? "…" : ""})`);
      setPriceNote(parts.join(" · ") || "no live-priced holdings yet");
      toast({
        message: estimateShares
          ? `Estimated shares and priced ${r.valueUpdated.length} holdings`
          : `Prices updated — ${r.valueUpdated.length} live, ${r.unresolved.length} manual`,
        tone: "ok",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Price refresh failed.");
      toast({ message: "Couldn't reach the price provider", tone: "error" });
    } finally {
      setRefreshing(false);
    }
  }

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
          <span className="asof mono">
            {pricesAsOf
              ? `prices ${new Date(pricesAsOf).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : "manual values"}{" "}
            · {fmtUSD(a.total)}
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
      {tab === "strategist" && <Strategist a={a} />}
    </div>
  );
}
