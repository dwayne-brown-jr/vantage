"use client";

import { useState } from "react";

import { Lock } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Login failed.");
      }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") ? next : "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setBusy(false);
    }
  }

  return (
    <div className="vt" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 380 }}>
        <div className="brand" style={{ marginBottom: 6 }}>
          <span className="mark">
            Vant<b>a</b>ge
          </span>
        </div>
        <div className="tagline" style={{ marginBottom: 20 }}>
          Personal portfolio desk
        </div>

        <form onSubmit={onSubmit}>
          <label htmlFor="pw" className="text-xs text-muted" style={{ display: "block", marginBottom: 6 }}>
            Enter your password to continue
          </label>
          <input
            id="pw"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="v-input mono"
            style={{ width: "100%", textAlign: "left", padding: "11px 12px", fontSize: 14 }}
          />

          {error && (
            <p className="warn" style={{ marginTop: 10 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !password}
            style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
          >
            <Lock size={15} /> {busy ? "Unlocking…" : "Unlock"}
          </button>
        </form>

        <p className="disc" style={{ marginTop: 16 }}>
          This is a private, single-user dashboard. Your financial data is only visible behind this login.
        </p>
      </div>
    </div>
  );
}
