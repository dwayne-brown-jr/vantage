"use client";

import { useMemo, useRef, useState } from "react";

import { Check, TriangleAlert, Upload, X } from "lucide-react";

import { importHoldings, type ImportResult } from "@/lib/api";
import { ASSET_CLASSES, ASSET_CLASS_KEYS } from "@/lib/constants";
import { CsvParseError, parseBrokerCsv, type BrokerFormat } from "@/lib/csv";
import { fmtUSD } from "@/lib/format";
import type { AssetClassKey, Holding, HoldingInput } from "@/lib/types";

const FORMAT_LABELS: Record<BrokerFormat, string> = {
  schwab: "Schwab positions",
  fidelity: "Fidelity portfolio",
  etrade: "E*Trade PortfolioDownload",
};

export default function CsvImport({
  holdings,
  onImported,
  onClose,
}: {
  /** Existing holdings, so the preview can flag which rows will update vs. add. */
  holdings: Holding[];
  onImported: (holdings: Holding[], summary: { created: number; updated: number }) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<BrokerFormat | null>(null);
  const [rows, setRows] = useState<HoldingInput[]>([]);
  const [accountLabel, setAccountLabel] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onFile(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseBrokerCsv(text);
      setFormat(parsed.format);
      setRows(parsed.holdings);
      setAccountLabel(parsed.accountLabel);
      setWarnings(parsed.warnings);
    } catch (e) {
      setFormat(null);
      setRows([]);
      setError(e instanceof CsvParseError ? e.message : "Could not read that file.");
    }
  }

  function setRowClass(i: number, assetClass: AssetClassKey) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, assetClass } : r)));
  }

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      const payload = rows.map((r) => ({ ...r, account: accountLabel.trim() || r.account }));
      const result: ImportResult = await importHoldings(payload);
      onImported(result.holdings, { created: result.created, updated: result.updated });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setSaving(false);
    }
  }

  const total = rows.reduce((s, r) => s + r.value, 0);
  const hasPreview = format !== null && rows.length > 0;

  // Which incoming rows match an existing position in the chosen account —
  // these will be refreshed, not duplicated.
  const existingSymbols = useMemo(() => {
    const label = accountLabel.trim();
    const set = new Set<string>();
    for (const h of holdings) if (h.account === label) set.add(h.symbol.trim().toUpperCase());
    return set;
  }, [holdings, accountLabel]);
  const willUpdate = (symbol: string): boolean => existingSymbols.has(symbol.trim().toUpperCase());
  const updateCount = rows.reduce((n, r) => n + (willUpdate(r.symbol) ? 1 : 0), 0);
  const newCount = rows.length - updateCount;

  return (
    <div className="card" style={{ marginBottom: 18, borderColor: "var(--gold-dim)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="sectit" style={{ margin: 0 }}>
          Import from broker CSV
        </div>
        <button className="iconbtn" aria-label="Close import" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {!hasPreview && (
        <>
          <button
            type="button"
            className="filezone w-full"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={18} style={{ display: "inline", marginRight: 8, verticalAlign: "-3px" }} />
            Choose a CSV — Schwab positions, Fidelity portfolio, or E*Trade PortfolioDownload
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
          <p className="disc">
            The file is parsed in your browser — only the rows you confirm are saved. Format is detected from the
            header row.
          </p>
        </>
      )}

      {error && (
        <p className="warn mt-3 flex items-start gap-2">
          <TriangleAlert size={15} className="mt-px flex-none" /> {error}
        </p>
      )}

      {hasPreview && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="badge">
              <Check size={13} /> Detected: {FORMAT_LABELS[format]}
            </span>
            <span className="text-xs text-muted">
              {rows.length} positions · {fmtUSD(total)}
            </span>
            {updateCount > 0 && (
              <span className="text-xs text-muted">
                · <span className="text-green">{newCount} new</span> ·{" "}
                <span style={{ color: "var(--gold)" }}>{updateCount} refresh existing</span>
              </span>
            )}
          </div>

          {updateCount > 0 && (
            <p className="disc" style={{ marginTop: 0 }}>
              Matching positions in <b>{accountLabel.trim()}</b> are refreshed in place (value &amp; cost basis
              updated, your asset-class choices kept) — re-importing won&apos;t create duplicates.
            </p>
          )}

          <label className="mb-1 block text-xs text-muted">Save into account</label>
          <input
            className="v-input mono mb-3"
            style={{ width: "100%", maxWidth: 360, textAlign: "left" }}
            value={accountLabel}
            onChange={(e) => setAccountLabel(e.target.value)}
            placeholder="Account label"
          />

          {warnings.length > 0 && (
            <ul className="mb-3 space-y-1">
              {warnings.map((w, i) => (
                <li key={i} className="warn flex items-start gap-2">
                  <TriangleAlert size={13} className="mt-px flex-none" /> {w}
                </li>
              ))}
            </ul>
          )}

          <div className="overflow-x-auto">
            <table className="v-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th></th>
                  <th>Name</th>
                  <th>Class (review)</th>
                  <th className="r">Value</th>
                  <th className="r">Cost basis</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">
                      <span className="sym">{r.symbol}</span>
                    </td>
                    <td>
                      <span className={"imptag " + (willUpdate(r.symbol) ? "upd" : "new")}>
                        {willUpdate(r.symbol) ? "Refresh" : "New"}
                      </span>
                    </td>
                    <td className="nm2 max-w-[220px] truncate">{r.name}</td>
                    <td>
                      <select
                        className="v-select"
                        value={r.assetClass}
                        onChange={(e) => setRowClass(i, e.target.value as AssetClassKey)}
                      >
                        {ASSET_CLASS_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {ASSET_CLASSES[k].label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="r mono">{fmtUSD(r.value)}</td>
                    <td className="r mono">{fmtUSD(r.costBasis)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button className="btn-primary" disabled={saving} onClick={() => void confirm()}>
              <Check size={15} /> {saving ? "Saving…" : `Add ${rows.length} positions`}
            </button>
            <button className="btn-ghost" disabled={saving} onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
