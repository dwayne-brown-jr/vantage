import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { classifyAccount } from "@/lib/accounts";
import { enrichPlan, PLAN_OUTPUT_SCHEMA, type PlanInput } from "@/lib/plan";
import { listHoldings } from "@/lib/repository";
import { STRATEGIST_SYSTEM, buildStrategistContext } from "@/lib/strategist";
import type { Holding } from "@/lib/types";

// Reads holdings + the server-only ANTHROPIC_API_KEY → Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.VANTAGE_STRATEGIST_MODEL ?? "claude-fable-5";
const IS_FABLE = MODEL === "claude-fable-5";
const FALLBACK_MODEL = "claude-opus-4-8";

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

// Structured outputs guarantee the shape; zod narrows the type and enforces
// sane bounds as a final safety net.
const planSchema = z.object({
  summary: z.string(),
  sells: z
    .array(z.object({ account: z.string(), symbol: z.string(), amount: z.number(), reason: z.string() }))
    .max(40),
  reinvests: z
    .array(
      z.object({ account: z.string(), symbol: z.string(), name: z.string(), amount: z.number(), reason: z.string() }),
    )
    .max(40),
  cautions: z.array(z.string()).max(15),
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

/** Generate + validate the plan. Returns the JSON payload for the client. */
async function generatePlan(instruction: string | undefined): Promise<{ plan?: unknown; error?: string }> {
  const holdings = await listHoldings();
  const context = buildStrategistContext(holdings);
  const system = `${STRATEGIST_SYSTEM}\n\n${context}`;

  const task =
    "Produce a complete, no-fluff rebalance plan as JSON matching the required schema. " +
    "List exactly which positions to SELL (account, symbol, dollar amount, short why) and where to REINVEST " +
    "(destination account, fund, dollar amount, short why). Prefer tax-free moves inside the Roth and 401(k); " +
    "respect the taxable SWPPX hold; cut single-stock and US-equity concentration; close the international and bond gaps. " +
    "Reinvest only into accounts that can hold new fund purchases — the Roth, the 401(k), or the taxable brokerage. " +
    "Never reinvest back into the RSU/employer grant account; proceeds from selling vested RSUs land in a brokerage. " +
    "Use one row per account+symbol so each move is precise. Choose dollar amounts that roughly net out (proceeds ≈ reinvestments). " +
    (instruction ? `Extra guidance from the owner: ${instruction}` : "");

  const client = new Anthropic();

  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await client.beta.messages.create({
      model: MODEL,
      // Fable 5's thinking counts toward max_tokens — leave headroom above the JSON.
      max_tokens: 16000,
      system,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: PLAN_OUTPUT_SCHEMA },
      },
      messages: [{ role: "user", content: task }],
      ...(IS_FABLE
        ? { betas: ["server-side-fallback-2026-06-01"], fallbacks: [{ model: FALLBACK_MODEL }] }
        : {}),
    });
  } catch {
    return { error: "Something went wrong reaching the model. Please try again." };
  }

  // Check the stop reason before reading content (Fable 5 can refuse).
  if (message.stop_reason === "refusal") {
    return { error: "The model declined this request. Try rephrasing your guidance." };
  }
  if (message.stop_reason === "max_tokens") {
    return { error: "The plan ran too long. Please try again." };
  }

  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "The model returned an unreadable plan. Try again." };
  }

  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) return { error: "The model returned an unexpected plan shape. Try again." };

  // Deterministic guardrails + tax math + totals from the real holdings.
  return { plan: enrichPlan(sanitizePlan(parsed.data, holdings), holdings) };
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError("ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.", 503);
  }

  const json = await req.json().catch(() => ({}));
  const parsedBody = bodySchema.safeParse(json ?? {});
  const instruction = parsedBody.success ? parsedBody.data.instruction : undefined;

  // Fable 5 takes ~30s to produce a plan — longer than serverless sync-function
  // limits. Stream the response instead: first byte goes out immediately and
  // whitespace heartbeats (legal JSON prefix) keep the connection alive until
  // the payload is ready. The client's res.json() waits for the stream to end.
  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(" "));
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(" "));
        } catch {
          /* stream already closed */
        }
      }, 5000);
      try {
        const payload = await generatePlan(instruction);
        controller.enqueue(encoder.encode(JSON.stringify(payload)));
      } catch {
        controller.enqueue(
          encoder.encode(JSON.stringify({ error: "Something went wrong building the plan. Please try again." })),
        );
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
