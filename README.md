# Vantage

A personal portfolio **tracker, planner, and AI strategist** — a single-user, local-first tool. It tracks holdings across accounts, plans diversification (with an RSU planner), and answers questions via a Claude-powered strategist that narrates over your own computed figures.

> **Private by design.** This repo is private because `lib/seed.ts` contains real holdings. Your live financial data, API key, and database are never committed (see `.gitignore`).

## Features

- **Overview** — concentration hero (single-stock vs. a comfort ceiling), allocation donuts, by-account/holding bar charts, auto-generated watch items, positions table.
- **Holdings** — editable table grouped by account with live recompute, plus CSV import for **Schwab / Fidelity / E\*Trade** exports (format auto-detected, confirm-before-save).
- **Plan** — target-vs-actual allocation gaps (editable, dollar deltas) and an RSU diversification planner that projects single-stock concentration toward a ceiling.
- **AI Strategist** — streaming chat that reasons over your computed portfolio, with live web search.

## Architecture

The math and the AI are strictly separated:

- **`lib/analytics.ts`** is the only place numbers are computed — pure, typed functions (totals, by-account/class, US/intl/bond buckets with target-date-fund decomposition, single-stock concentration, target gaps, RSU projection). Covered by Vitest (`tests/`).
- The **LLM never computes** — the strategist route builds context from `analytics.ts` results server-side and narrates over them.
- **Persistence is pluggable** (`lib/store/`): SQLite (better-sqlite3) for local dev, **Netlify Blobs** in production. A `lib/datasource` interface is stubbed for a future live price feed / brokerage aggregation.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · `@anthropic-ai/sdk` · better-sqlite3 / Netlify Blobs · Vitest.

## Local development

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Other scripts: `npm test` (analytics + CSV parser), `npm run typecheck`, `npm run build`.

Local dev uses SQLite at `data/vantage.db` (gitignored) and **no login** unless `VANTAGE_PASSWORD` is set.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | Server-only; used by the strategist route. Never exposed to the browser. |
| `VANTAGE_PASSWORD` | hosted only | Enables the login gate. **Required** for any public deployment. |
| `VANTAGE_STORE` | hosted | `blobs` in production (set on Netlify). Defaults to SQLite locally. |
| `VANTAGE_STRATEGIST_MODEL` | no | Override the model (default `claude-sonnet-4-6`). |

## Deployment (Netlify)

Hosted on Netlify with Netlify Blobs persistence and a password gate (edge middleware + signed cookie). Environment variables are set on the site (not in the repo). Manual redeploy from the repo:

```bash
netlify deploy --build --prod
```

With GitHub continuous deployment linked, every push to `main` builds and deploys automatically.

---

_Educational tool — not licensed investment, tax, or legal advice._
