"use client";

import { useMemo, useState } from "react";

import { LogOut } from "lucide-react";

import Holdings from "@/components/Holdings";
import Overview from "@/components/Overview";
import Plan from "@/components/Plan";
import Strategist from "@/components/Strategist";
import { createHolding, deleteHolding, refreshPrices, updateHolding } from "@/lib/api";
import { analyze } from "@/lib/analytics";
import { fmtUSD } from "@/lib/format";
import type { Holding, HoldingInput } from "@/lib/types";

type Tab = "overview" | "holdings" | "plan" | "strategist";

const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["holdings", "Holdings"],
  ["plan", "Plan"],
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
  const [pricesAsOf, setPricesAsOf] = useState<string | null>(null);
  const [priceNote, setPriceNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Price refresh failed.");
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

  async function onDelete(id: string) {
    const prev = holdings;
    setHoldings((hs) => hs.filter((h) => h.id !== id)); // optimistic
    try {
      await deleteHolding(id);
    } catch (e) {
      setHoldings(prev); // revert on failure
      setError(e instanceof Error ? e.message : "Failed to delete position.");
    }
  }

  function onImported(created: Holding[]) {
    setHoldings((hs) => [...hs, ...created]);
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
              : "as of 6/15/26"}{" "}
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
      {tab === "plan" && <Plan a={a} />}
      {tab === "strategist" && <Strategist a={a} />}
    </div>
  );
}
