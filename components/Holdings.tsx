"use client";

import { useEffect, useState } from "react";

import { Calculator, FileUp, Plus, RefreshCw, Trash2 } from "lucide-react";

import CsvImport from "@/components/CsvImport";
import { ASSET_CLASSES, ASSET_CLASS_KEYS } from "@/lib/constants";
import { fmtUSD } from "@/lib/format";
import type { AssetClassKey, Holding, HoldingInput } from "@/lib/types";

export interface HoldingsProps {
  holdings: Holding[];
  /** Update local state only (instant recompute, no persistence). */
  onLive: (id: string, patch: Partial<HoldingInput>) => void;
  /** Persist a change to the database. */
  onCommit: (id: string, patch: Partial<HoldingInput>) => void;
  onAdd: (account: string) => void;
  onDelete: (id: string) => void;
  onImported: (created: Holding[]) => void;
  onRefreshPrices: (estimateShares?: boolean) => void;
  refreshing: boolean;
  pricesAsOf: string | null;
  priceNote: string | null;
}

const fmtPrice = (n: number): string =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Holdings({
  holdings,
  onLive,
  onCommit,
  onAdd,
  onDelete,
  onImported,
  onRefreshPrices,
  refreshing,
  pricesAsOf,
  priceNote,
}: HoldingsProps) {
  const [importing, setImporting] = useState(false);
  const isMobile = useIsMobile();
  const accounts = [...new Set(holdings.map((h) => h.account))];

  return (
    <div className="card">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className="sectit" style={{ margin: 0 }}>
          Holdings — live prices + manual edits
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn-ghost"
            disabled={refreshing}
            onClick={() => onRefreshPrices(false)}
            title="Fetch latest prices and recompute values from share counts"
          >
            <RefreshCw size={15} className={refreshing ? "spin" : ""} /> {refreshing ? "Refreshing…" : "Refresh prices"}
          </button>
          <button
            className="btn-ghost"
            disabled={refreshing}
            onClick={() => onRefreshPrices(true)}
            title="Estimate share counts from current values, then price them live"
          >
            <Calculator size={15} /> Estimate shares
          </button>
          {!importing && (
            <button className="btn-ghost" onClick={() => setImporting(true)}>
              <FileUp size={15} /> Import CSV
            </button>
          )}
        </div>
      </div>

      {(pricesAsOf || priceNote) && (
        <div className="mb-3 text-xs text-muted">
          {pricesAsOf && (
            <>Live prices as of {new Date(pricesAsOf).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</>
          )}
          {priceNote && <span style={{ color: "var(--faint)" }}> · {priceNote}</span>}
        </div>
      )}

      {importing && <CsvImport onImported={onImported} onClose={() => setImporting(false)} />}

      {accounts.map((account) => {
        const rows = holdings.filter((h) => h.account === account);
        const sub = rows.reduce((s, h) => s + (h.value || 0), 0);
        return (
          <div key={account}>
            <div className="acctlbl">
              {account} · <span className="mono" style={{ color: "var(--muted)" }}>{fmtUSD(sub)}</span>
            </div>
            {isMobile ? (
              <div className="hcards">
                {rows.map((h) => (
                  <HoldingCard key={h.id} h={h} onLive={onLive} onCommit={onCommit} onDelete={onDelete} />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="v-table">
                  <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Class</th>
                    <th className="r">Shares</th>
                    <th className="r">Value</th>
                    <th className="r">Cost basis</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <input
                          className="v-input mono"
                          style={{ width: 96, textAlign: "left", fontWeight: 700 }}
                          value={h.symbol}
                          aria-label="Symbol"
                          onChange={(e) => onLive(h.id, { symbol: e.target.value })}
                          onBlur={(e) => onCommit(h.id, { symbol: e.target.value.toUpperCase().trim() || "—" })}
                        />
                      </td>
                      <td>
                        <input
                          className="v-input"
                          style={{ width: 180, textAlign: "left", fontFamily: "var(--font-sans)" }}
                          value={h.name}
                          aria-label="Name"
                          onChange={(e) => onLive(h.id, { name: e.target.value })}
                          onBlur={(e) => onCommit(h.id, { name: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          className="v-select"
                          value={h.assetClass}
                          aria-label="Asset class"
                          onChange={(e) => onCommit(h.id, { assetClass: e.target.value as AssetClassKey })}
                        >
                          {ASSET_CLASS_KEYS.map((k) => (
                            <option key={k} value={k}>
                              {ASSET_CLASSES[k].label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="r">
                        <NumberCell
                          value={h.quantity ?? 0}
                          ariaLabel="Shares"
                          blankZero
                          placeholder="—"
                          onLive={(n) => onLive(h.id, { quantity: n })}
                          onCommit={(n) => onCommit(h.id, { quantity: n })}
                        />
                      </td>
                      <td className="r">
                        <NumberCell
                          value={h.value}
                          ariaLabel="Value"
                          onLive={(n) => onLive(h.id, { value: n })}
                          onCommit={(n) => onCommit(h.id, { value: n })}
                        />
                        <PriceHint h={h} />
                      </td>
                      <td className="r">
                        <NumberCell
                          value={h.costBasis}
                          ariaLabel="Cost basis"
                          onLive={(n) => onLive(h.id, { costBasis: n })}
                          onCommit={(n) => onCommit(h.id, { costBasis: n })}
                        />
                      </td>
                      <td className="r">
                        <button className="iconbtn" aria-label={`Delete ${h.symbol}`} onClick={() => onDelete(h.id)}>
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
            <button className="addbtn" onClick={() => onAdd(account)}>
              <Plus size={15} /> Add position
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Live (green) when value is derived from shares × price; faint when manual. */
function PriceHint({ h }: { h: Holding }) {
  if (h.price == null || h.price <= 0) return null;
  const live = (h.quantity ?? 0) > 0;
  return (
    <div className="mono" style={{ fontSize: 10, marginTop: 2, color: live ? "var(--green)" : "var(--faint)" }}>
      {live ? "● " : ""}@ {fmtPrice(h.price)}
    </div>
  );
}

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

/** Stacked card view of a holding for narrow screens. */
function HoldingCard({
  h,
  onLive,
  onCommit,
  onDelete,
}: {
  h: Holding;
  onLive: HoldingsProps["onLive"];
  onCommit: HoldingsProps["onCommit"];
  onDelete: HoldingsProps["onDelete"];
}) {
  return (
    <div className="hcard">
      <div className="hcard-top">
        <input
          className="v-input mono"
          style={{ width: 92, textAlign: "left", fontWeight: 700 }}
          value={h.symbol}
          aria-label="Symbol"
          onChange={(e) => onLive(h.id, { symbol: e.target.value })}
          onBlur={(e) => onCommit(h.id, { symbol: e.target.value.toUpperCase().trim() || "—" })}
        />
        <input
          className="v-input"
          style={{ flex: 1, minWidth: 0, textAlign: "left", fontFamily: "var(--font-sans)" }}
          value={h.name}
          aria-label="Name"
          onChange={(e) => onLive(h.id, { name: e.target.value })}
          onBlur={(e) => onCommit(h.id, { name: e.target.value })}
        />
        <button className="iconbtn" aria-label={`Delete ${h.symbol}`} onClick={() => onDelete(h.id)}>
          <Trash2 size={15} />
        </button>
      </div>
      <select
        className="v-select"
        style={{ width: "100%" }}
        value={h.assetClass}
        aria-label="Asset class"
        onChange={(e) => onCommit(h.id, { assetClass: e.target.value as AssetClassKey })}
      >
        {ASSET_CLASS_KEYS.map((k) => (
          <option key={k} value={k}>
            {ASSET_CLASSES[k].label}
          </option>
        ))}
      </select>
      <div className="hcard-grid">
        <div>
          <label>Shares</label>
          <NumberCell
            value={h.quantity ?? 0}
            ariaLabel="Shares"
            blankZero
            placeholder="—"
            onLive={(n) => onLive(h.id, { quantity: n })}
            onCommit={(n) => onCommit(h.id, { quantity: n })}
          />
        </div>
        <div>
          <label>Value</label>
          <NumberCell
            value={h.value}
            ariaLabel="Value"
            onLive={(n) => onLive(h.id, { value: n })}
            onCommit={(n) => onCommit(h.id, { value: n })}
          />
          <PriceHint h={h} />
        </div>
        <div>
          <label>Cost</label>
          <NumberCell
            value={h.costBasis}
            ariaLabel="Cost basis"
            onLive={(n) => onLive(h.id, { costBasis: n })}
            onCommit={(n) => onCommit(h.id, { costBasis: n })}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Numeric cell that keeps a string draft while typing (so the field can be
 * cleared), pushes finite values up live for instant recompute, and commits
 * (persists) on blur / Enter.
 */
function NumberCell({
  value,
  ariaLabel,
  onLive,
  onCommit,
  blankZero = false,
  placeholder,
}: {
  value: number;
  ariaLabel: string;
  onLive: (n: number) => void;
  onCommit: (n: number) => void;
  /** Show an empty field (not "0") when the value is 0 — e.g. unset share counts. */
  blankZero?: boolean;
  placeholder?: string;
}) {
  const display = (v: number): string => (blankZero && v === 0 ? "" : String(v));
  const [draft, setDraft] = useState(display(value));
  const [focused, setFocused] = useState(false);

  // Resync when the underlying value changes externally (e.g. after refresh),
  // but never yank the field out from under the user mid-edit.
  useEffect(() => {
    if (!focused) setDraft(display(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused, blankZero]);

  return (
    <input
      className="v-input mono"
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n)) onLive(n);
      }}
      onBlur={(e) => {
        setFocused(false);
        const n = parseFloat(e.target.value);
        const finite = Number.isFinite(n) ? n : 0;
        setDraft(display(finite));
        onCommit(finite);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
