import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { enrichPlan, PLAN_TOOL_SCHEMA, type PlanInput } from "@/lib/plan";
import { listHoldings } from "@/lib/repository";
import { STRATEGIST_SYSTEM, buildStrategistContext } from "@/lib/strategist";

// Reads holdings + the server-only ANTHROPIC_API_KEY → Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.VANTAGE_STRATEGIST_MODEL ?? "claude-opus-4-8";

/** Tolerate "$15,000" / "~15000" if the model strays from plain integers. */
const dollars = z.preprocess((v) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : v;
  }
  return v;
}, z.number());

const planSchema = z.object({
  summary: z.string(),
  sells: z
    .array(
      z.object({
        account: z.string(),
        symbol: z.string(),
        amount: dollars,
        reason: z.string(),
      }),
    )
    .max(20),
  reinvests: z
    .array(
      z.object({
        account: z.string(),
        symbol: z.string(),
        name: z.string(),
        amount: dollars,
        reason: z.string(),
      }),
    )
    .max(20),
  cautions: z.array(z.string()).max(10),
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

  let raw: unknown;
  try {
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
    if (!block || block.type !== "tool_use") return jsonError("The model did not return a plan. Try again.", 502);
    raw = block.input;
  } catch {
    return jsonError("Something went wrong reaching the model. Please try again.", 502);
  }

  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) return jsonError("The model returned an unexpected plan shape. Try again.", 502);

  // Deterministic tax math + totals from the real holdings.
  const plan = enrichPlan(parsed.data as PlanInput, holdings);
  return new Response(JSON.stringify({ plan }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
