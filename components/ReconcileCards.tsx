"use client";

import { useState } from "react";

import { AlertTriangle, Check, FileUp, Plus, TriangleAlert, X } from "lucide-react";

import { ASSET_CLASSES } from "@/lib/constants";
import { fmtUSD } from "@/lib/format";
import type { ReconcileChange, ReconcileProposal, Reconciliation } from "@/lib/reconcile";

/** Per-proposal state: undecided, applied, or dismissed. */
type Decision = "pending" | "applied" | "dismissed" | "failed";

function fmtField(c: ReconcileChange): { label: string; from: string; to: string } {
  if (c.field === "quantity") {
    return {
      label: "Shares",
      from: c.from == null ? "—" : String(c.from),
      to: String(c.to),
    };
  }
  return {
    label: c.field === "value" ? "Value" : "Cost basis",
    from: c.from == null ? "—" : fmtUSD(c.from),
    to: fmtUSD(c.to),
  };
}

export default function ReconcileCards({
  data,
  onApply,
  onRequestUpload,
}: {
  data: Reconciliation;
  /** Applies one proposal; resolves false if the write failed. */
  onApply: (p: ReconcileProposal) => Promise<boolean>;
  onRequestUpload?: () => void;
}) {
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [busyIdx, setBusyIdx] = useState<number | null>(null);

  async function apply(i: number, p: ReconcileProposal) {
    setBusyIdx(i);
    const ok = await onApply(p);
    setDecisions((d) => ({ ...d, [i]: ok ? "applied" : "failed" }));
    setBusyIdx(null);
  }

  async function applyAllClean() {
    for (let i = 0; i < data.proposals.length; i++) {
      const p = data.proposals[i]!;
      if (decisions[i] || p.warnings.length > 0 || p.confidence !== "high") continue;
      await apply(i, p);
    }
  }

  const cleanCount = data.proposals.filter(
    (p, i) => !decisions[i] && p.warnings.length === 0 && p.confidence === "high",
  ).length;

  if (data.proposals.length === 0 && data.needStatement.length === 0) {
    return (
      <div className="rec-empty">
        <Check size={15} /> Everything in that attachment already matches your ledger — nothing to change.
        {data.rejected.length > 0 && (
          <div className="rec-rejnote">
            {data.rejected.length} reading{data.rejected.length === 1 ? "" : "s"} skipped (
            {data.rejected.map((r) => `${r.symbol}: ${r.why}`).join("; ")}).
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rec">
      {data.notes.map((n, i) => (
        <div className="rec-note" key={i}>
          {n}
        </div>
      ))}

      {data.proposals.length > 0 && (
        <div className="rec-head">
          <span>
            {data.proposals.length} proposed change{data.proposals.length === 1 ? "" : "s"} — nothing is saved until you
            approve it.
          </span>
          {cleanCount > 1 && (
            <button className="rec-allbtn" onClick={() => void applyAllClean()} disabled={busyIdx != null}>
              <Check size={13} /> Apply {cleanCount} clean
            </button>
          )}
        </div>
      )}

      {data.proposals.map((p, i) => {
        const state = decisions[i] ?? "pending";
        const risky = p.warnings.length > 0 || p.confidence === "low";
        return (
          <div className={`rec-card ${state} ${risky ? "risky" : ""}`} key={i}>
            <div className="rec-top">
              <span className="rec-sym mono">{p.symbol}</span>
              {p.kind === "add" && (
                <span className="rec-badge add">
                  <Plus size={11} /> new
                </span>
              )}
              <span className={`rec-badge conf-${p.confidence}`}>{p.confidence}</span>
              <span className="rec-acct">{p.account}</span>
            </div>

            <div className="rec-changes">
              {p.changes.map((c, j) => {
                const f = fmtField(c);
                return (
                  <div className="rec-chg" key={j}>
                    <span className="rec-lbl">{f.label}</span>
                    <span className="rec-from mono">{f.from}</span>
                    <span className="rec-arrow">→</span>
                    <span className="rec-to mono">{f.to}</span>
                    {c.deltaPct != null && (
                      <span className={"rec-delta " + (c.deltaPct >= 0 ? "pos" : "neg")}>
                        {c.deltaPct >= 0 ? "+" : ""}
                        {c.deltaPct.toFixed(1)}%
                      </span>
                    )}
                  </div>
                );
              })}
              {p.kind === "add" && (
                <div className="rec-chg">
                  <span className="rec-lbl">Class</span>
                  <span className="rec-to">{ASSET_CLASSES[p.assetClass].label}</span>
                </div>
              )}
            </div>

            {p.observed && (
              <div className="rec-obs">
                Read: <span className="mono">“{p.observed}”</span>
              </div>
            )}
            {p.reason && <div className="rec-why">{p.reason}</div>}

            {p.warnings.map((w, j) => (
              <div className="rec-warn" key={j}>
                <TriangleAlert size={13} /> {w}
              </div>
            ))}

            {state === "pending" ? (
              <div className="rec-actions">
                <button className="rec-apply" disabled={busyIdx != null} onClick={() => void apply(i, p)}>
                  <Check size={14} /> {busyIdx === i ? "Applying…" : p.kind === "add" ? "Add to ledger" : "Apply"}
                </button>
                <button
                  className="rec-dismiss"
                  disabled={busyIdx != null}
                  onClick={() => setDecisions((d) => ({ ...d, [i]: "dismissed" }))}
                >
                  <X size={14} /> Dismiss
                </button>
              </div>
            ) : (
              <div className={"rec-state " + state}>
                {state === "applied" && (
                  <>
                    <Check size={13} /> Applied to your ledger
                  </>
                )}
                {state === "dismissed" && (
                  <>
                    <X size={13} /> Dismissed
                  </>
                )}
                {state === "failed" && (
                  <>
                    <AlertTriangle size={13} /> Couldn&apos;t save — try again
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {data.needStatement.map((r, i) => (
        <div className="rec-ask" key={i}>
          <FileUp size={15} />
          <div>
            <div className="rec-ask-t">Send the full statement for {r.account}</div>
            <div className="rec-ask-d">{r.why}</div>
          </div>
          {onRequestUpload && (
            <button className="rec-ask-btn" onClick={onRequestUpload}>
              Attach
            </button>
          )}
        </div>
      ))}

      {data.rejected.length > 0 && (
        <div className="rec-rejnote">
          Skipped: {data.rejected.map((r) => `${r.symbol} (${r.why})`).join(", ")}.
        </div>
      )}
    </div>
  );
}
