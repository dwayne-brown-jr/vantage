# Vantage

Private portfolio tracker and AI "strategist" — single-stock concentration analysis, allocation views, an RSU diversification planner, and a streaming AI strategist.

**Status:** deployed (Netlify)

---

## The architecture that matters

**All math runs in a pure, unit-tested analytics layer. The LLM only narrates over server-computed figures — it never calculates.**

This is the whole point of the project. Every number the AI strategist says out loud was produced by deterministic, tested code and handed to the model as input. The model's job is explanation, not arithmetic.

That means:

- A number in the UI can be traced to a tested function, not to a token prediction
- The analytics layer can be unit-tested independently of any model
- Changing the model can change the *prose*, but it cannot change the *figures*

It's a direct answer to the first question anyone serious asks about an AI finance tool: *can I trust the numbers?*

## Features

- Single-stock concentration analysis
- Allocation views across accounts
- CSV import for Schwab, Fidelity, and E\*Trade
- RSU diversification planner
- Streaming AI strategist

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · better-sqlite3 / Netlify Blobs · edge middleware
