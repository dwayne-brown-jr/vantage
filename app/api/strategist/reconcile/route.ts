import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { RECONCILE_OUTPUT_SCHEMA, enrichReconciliation, type ReconcileInput } from "@/lib/reconcile";
import { listHoldings } from "@/lib/repository";
import { buildStrategistContext } from "@/lib/strategist";

// Reads holdings + the server-only ANTHROPIC_API_KEY → Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.VANTAGE_STRATEGIST_MODEL ?? "claude-fable-5";
const IS_FABLE = MODEL === "claude-fable-5";
const FALLBACK_MODEL = "claude-opus-4-8";

/**
 * Reconciliation persona. Deliberately narrower than the strategist: this call
 * only READS the document. It must not advise, and it must not do arithmetic —
 * every comparison against the ledger happens in lib/reconcile.ts.
 */
const RECONCILE_SYSTEM = [
  "You are reading an attached brokerage screenshot or account statement and reporting what it says, so the owner's ledger can be corrected.",
  "",
  "RULES:",
  "• Report ONLY figures you can actually see in the attachment. Never infer, extrapolate, or carry a number over from the ledger.",
  "• Do not do arithmetic. Do not compute differences, totals, or percentages — report the raw figures as printed and nothing else.",
  "• Quote what you read verbatim in `observed` (e.g. \"Cash & Cash Investments $10,701.20\"). This is the audit trail.",
  "• Use the ledger's own account label in `account` whenever the attachment clearly refers to that account.",
  "• Only include a position when the attachment's figure DIFFERS from the ledger, or when the position is missing from the ledger entirely.",
  "• Set `confidence` honestly: 'high' only when the number is crisply legible; 'low' when the image is blurry, cropped, or ambiguous.",
  "• If the attachment is partial — a summary page, a cropped screenshot, one tab of several — add an entry to `needStatement` naming the account and what a full statement would show. Prefer asking over guessing.",
  "• If nothing differs, return empty arrays. An empty result is a correct and useful answer.",
  "• Never invent a position that is not visible in the attachment.",
].join("\n");

const imageBlock = z.object({
  type: z.literal("image"),
  source: z.object({
    type: z.literal("base64"),
    media_type: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
    data: z.string().min(1).max(7_500_000),
  }),
});
const documentBlock = z.object({
  type: z.literal("document"),
  source: z.object({
    type: z.literal("base64"),
    media_type: z.literal("application/pdf"),
    data: z.string().min(1).max(9_000_000),
  }),
});

const bodySchema = z.object({
  attachments: z.array(z.discriminatedUnion("type", [imageBlock, documentBlock])).min(1).max(6),
  /** Optional steer, e.g. "this is only the Roth". */
  instruction: z.string().max(1000).optional(),
});

// Structured outputs guarantee the shape; zod is the final safety net before
// anything reaches the reconciliation engine.
const modelSchema = z.object({
  proposals: z
    .array(
      z.object({
        kind: z.enum(["update", "add"]),
        account: z.string(),
        symbol: z.string(),
        name: z.string().optional(),
        assetClass: z.string().optional(),
        value: z.number().nullable().optional(),
        quantity: z.number().nullable().optional(),
        costBasis: z.number().nullable().optional(),
        confidence: z.enum(["high", "medium", "low"]),
        observed: z.string(),
        reason: z.string(),
      }),
    )
    .max(40),
  needStatement: z.array(z.object({ account: z.string(), why: z.string() })).max(5),
  notes: z.array(z.string()).max(5),
});

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function reconcile(
  attachments: z.infer<typeof bodySchema>["attachments"],
  instruction: string | undefined,
): Promise<{ reconciliation?: unknown; error?: string }> {
  const holdings = await listHoldings();
  const system = `${RECONCILE_SYSTEM}\n\n${buildStrategistContext(holdings)}`;

  const task =
    "Read the attached document(s). Report every position whose figures differ from the ledger above, and every position " +
    "visible in the attachment that the ledger is missing. Report only what you can see; quote it verbatim in `observed`. " +
    "If the attachment is partial, say so via `needStatement` instead of guessing. " +
    (instruction ? `Context from the owner: ${instruction}` : "");

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
        format: { type: "json_schema", schema: RECONCILE_OUTPUT_SCHEMA },
      },
      messages: [{ role: "user", content: [...attachments, { type: "text", text: task }] }],
      ...(IS_FABLE
        ? { betas: ["server-side-fallback-2026-06-01"], fallbacks: [{ model: FALLBACK_MODEL }] }
        : {}),
    });
  } catch (err) {
    console.error("[reconcile] request failed:", err);
    const detail = err instanceof Anthropic.APIError ? ` (${err.status})` : "";
    return { error: `Something went wrong reading the attachment. Please try again.${detail}` };
  }

  if (message.stop_reason === "refusal") {
    return { error: "The model declined to read this attachment." };
  }
  if (message.stop_reason === "max_tokens") {
    return { error: "That document was too long to read in one pass. Try a single account's statement." };
  }

  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "The model returned an unreadable result. Try again." };
  }

  const parsed = modelSchema.safeParse(raw);
  if (!parsed.success) return { error: "The model returned an unexpected shape. Try again." };

  // Deterministic: every comparison and guardrail happens here, not in the model.
  return { reconciliation: enrichReconciliation(parsed.data as ReconcileInput, holdings) };
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError("ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.", 503);
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return jsonError("Attach a screenshot or PDF to reconcile.", 400);

  // Same streaming shape as the plan route: whitespace heartbeats keep the
  // connection alive past serverless sync limits while the model reads.
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
        const payload = await reconcile(parsed.data.attachments, parsed.data.instruction);
        controller.enqueue(encoder.encode(JSON.stringify(payload)));
      } catch (err) {
        console.error("[reconcile] failed:", err);
        controller.enqueue(
          encoder.encode(JSON.stringify({ error: "Something went wrong reading the attachment. Please try again." })),
        );
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
