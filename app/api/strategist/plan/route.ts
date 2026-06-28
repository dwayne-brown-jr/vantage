import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { classifyAccount } from "@/lib/accounts";
import { enrichPlan, PLAN_TOOL_SCHEMA, type PlanInput } from "@/lib/plan";
import { listHoldings } from "@/lib/repository";
import { STRATEGIST_SYSTEM, buildStrategistContext } from "@/lib/strategist";
import type { Holding } from "@/lib/types";

/** Largest fund-holding account (tax-advantaged first) — never the RSU grant. */
function fundAccount(holdings: Holding[]): string {
  const totals = new Map<string, number>();
  for (const h of holdings) totals.set(h.account, (totals.get(h.account) ?? 0) + h.value);
  const nonRsu = [...totals.entries()]
    .filter(([acc]) => classifyAccount(acc).treatment !== "rsu")
    .sort((a, b) => b[1] - a[1]);
  const taxAdv = nonRsu.filter(([acc]) => classifyAccount(acc).taxFreeToRebalance);
  return taxAdv[0]?.[0] ?? nonRsu[0]?.[0] ?? holdings[0]?.account ?? "Brokerage";
}

/**
 * Deterministic guardrails on the model's plan: you can't buy funds inside an
 * RSU grant account (proceeds land in a brokerage), and the taxable SWPPX is a
 * hold. The model is told both, but enforce them so a stray row never shows.
 */
function sanitizePlan(plan: PlanInput, holdings: Holding[]): PlanInput {
  const dest = fundAccount(holdings);
  return {
    ...plan,
    sells: plan.sells.filter(
      (s) => !(s.symbol.toUpperCase() === "SWPPX" && classifyAccount(s.account).treatment === "taxable"),
    ),
    reinvests: plan.reinvests.map((r) =>
      classifyAccount(r.account).treatment === "rsu" ? { ...r, account: dest } : r,
    ),
  };
}

// Reads holdings + the server-only ANTHROPIC_API_KEY → Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.VANTAGE_STRATEGIST_MODEL ?? "claude-opus-4-8";

/** Tolerate "$15,000" / "~15000" / "2500-3000" if the model strays from integers. */
const dollars = z
  .preprocess((v) => {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = parseFloat(v.replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) ? n : 0;
    }
    return v;
  }, z.number())
  .catch(0);

// Display fields default to "" and cautions drop non-strings, so a minor model
// deviation degrades a row gracefully instead of failing the whole plan. The
// structural fields (account/symbol/amount) stay required.
const str = z.string().optional().default("");

const planSchema = z.object({
  summary: str,
  sells: z
    .array(z.object({ account: z.string(), symbol: z.string(), amount: dollars, reason: str }))
    .max(30)
    .optional()
    .default([]),
  reinvests: z
    .array(z.object({ account: z.string(), symbol: z.string(), name: str, amount: dollars, reason: str }))
    .max(30)
    .optional()
    .default([]),
  cautions: z
    .array(z.unknown())
    .optional()
    .default([])
    .transform((a) => a.filter((x): x is string => typeof x === "string")),
});

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const bodySchema = z.object({
  /** Optional free-text steer, e.g. "I want more international" or a dollar focus. */
  instruction: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError("ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.", 503);
  }

  const json = await req.json().catch(() => ({}));
  const parsedBody = bodySchema.safeParse(json ?? {});
  const instruction = parsedBody.success ? parsedBody.data.instruction : undefined;

  const holdings = await listHoldings();
  const context = buildStrategistContext(holdings);
  const system = `${STRATEGIST_SYSTEM}\n\n${context}`;

  const task =
    "Produce a complete, no-fluff rebalance plan as a structured emit_plan call. " +
    "List exactly which positions to SELL (account, symbol, dollar amount, short why) and where to REINVEST " +
    "(destination account, fund, dollar amount, short why). Prefer tax-free moves inside the Roth and 401(k); " +
    "respect the taxable SWPPX hold; cut single-stock and US-equity concentration; close the international and bond gaps. " +
    "Reinvest only into accounts that can hold new fund purchases — the Roth, the 401(k), or the taxable brokerage. " +
    "Never reinvest back into the RSU/employer grant account; proceeds from selling vested RSUs land in a brokerage. " +
    "Use one row per account+symbol so each move is precise. Choose dollar amounts that roughly net out (proceeds ≈ reinvestments). " +
    (instruction ? `Extra guidance from the owner: ${instruction}` : "");

  const client = new Anthropic();

  // Force the structured tool call. The model occasionally deviates from the
  // schema, so try twice before giving up.
  async function emitPlan(): Promise<unknown | null> {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      tools: [
        {
          name: "emit_plan",
          description: "Emit the structured sell/reinvest plan.",
          input_schema: PLAN_TOOL_SCHEMA as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: "emit_plan" },
      messages: [{ role: "user", content: task }],
    });
    const block = message.content.find((b) => b.type === "tool_use");
    return block && block.type === "tool_use" ? block.input : null;
  }

  let parsedPlan: PlanInput | null = null;
  for (let attempt = 0; attempt < 2 && !parsedPlan; attempt++) {
    let raw: unknown | null;
    try {
      raw = await emitPlan();
    } catch {
      return jsonError("Something went wrong reaching the model. Please try again.", 502);
    }
    if (raw == null) continue;
    const parsed = planSchema.safeParse(raw);
    if (parsed.success) {
      parsedPlan = parsed.data as PlanInput;
    } else {
      console.error("emit_plan shape mismatch", {
        keys: raw && typeof raw === "object" ? Object.keys(raw) : typeof raw,
        issues: parsed.error.issues.slice(0, 5),
      });
    }
  }

  if (!parsedPlan) return jsonError("The model returned an unexpected plan shape. Try again.", 502);

  // Deterministic guardrails + tax math + totals from the real holdings.
  const plan = enrichPlan(sanitizePlan(parsedPlan, holdings), holdings);
  return new Response(JSON.stringify({ plan }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
