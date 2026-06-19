"use client";

import { useEffect, useState } from "react";

import { FileUp, Plus, Trash2 } from "lucide-react";

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
}

export default function Holdings({ holdings, onLive, onCommit, onAdd, onDelete, onImported }: HoldingsProps) {
  const [importing, setImporting] = useState(false);
  const accounts = [...new Set(holdings.map((h) => h.account))];

  return (
    <div className="card">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className="sectit" style={{ margin: 0 }}>
          Holdings — edit values to keep it current
        </div>
        {!importing && (
          <button className="btn-ghost" onClick={() => setImporting(true)}>
            <FileUp size={15} /> Import CSV
          </button>
        )}
      </div>

      {importing && <CsvImport onImported={onImported} onClose={() => setImporting(false)} />}

      {accounts.map((account) => {
        const rows = holdings.filter((h) => h.account === account);
        const sub = rows.reduce((s, h) => s + (h.value || 0), 0);
        return (
          <div key={account}>
            <div className="acctlbl">
              {account} · <span className="mono" style={{ color: "var(--muted)" }}>{fmtUSD(sub)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="v-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Class</th>
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
                          value={h.value}
                          ariaLabel="Value"
                          onLive={(n) => onLive(h.id, { value: n })}
                          onCommit={(n) => onCommit(h.id, { value: n })}
                        />
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
            <button className="addbtn" onClick={() => onAdd(account)}>
              <Plus size={15} /> Add position
            </button>
          </div>
        );
      })}
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
}: {
  value: number;
  ariaLabel: string;
  onLive: (n: number) => void;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Resync when the underlying value changes externally (e.g. after import),
  // but never yank the field out from under the user mid-edit.
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  return (
    <input
      className="v-input mono"
      inputMode="decimal"
      aria-label={ariaLabel}
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
        setDraft(String(finite));
        onCommit(finite);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
