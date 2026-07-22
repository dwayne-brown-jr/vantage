import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { listHoldings } from "@/lib/repository";
import { STRATEGIST_SYSTEM, buildStrategistContext } from "@/lib/strategist";

// Reads the local SQLite DB and the server-only ANTHROPIC_API_KEY → Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.VANTAGE_STRATEGIST_MODEL ?? "claude-fable-5";
// Fable 5's safety classifiers can decline a request (stop_reason "refusal");
// the server-side fallback re-runs it on Opus 4.8 in the same call.
const IS_FABLE = MODEL === "claude-fable-5";
const FALLBACK_MODEL = "claude-opus-4-8";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(50),
});

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  // The key lives ONLY here, server-side. It is never sent to the client.
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError("ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.", 503);
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return jsonError("Invalid request body.", 400);

  // Build the portfolio context server-side from the canonical figures.
  const context = buildStrategistContext(await listHoldings());
  const system = `${STRATEGIST_SYSTEM}\n\n${context}`;

  const client = new Anthropic();
  // Fable 5 thinks adaptively by default (the `thinking` param must be omitted).
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 8192,
    system,
    // Server-side web search so the strategist can pull current headlines.
    tools: [{ type: "web_search_20260209", name: "web_search" }],
    messages: parsed.data.messages,
    ...(IS_FABLE
      ? { betas: ["server-side-fallback-2026-06-01"], fallbacks: [{ model: FALLBACK_MODEL }] }
      : {}),
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let emittedText = false;
      let refused = false;
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            emittedText = true;
            controller.enqueue(encoder.encode(event.delta.text));
          } else if (event.type === "message_delta" && event.delta.stop_reason === "refusal") {
            refused = true;
          }
        }
        // The whole model chain declined (rare; the fallback usually answers).
        if (refused && !emittedText) {
          controller.enqueue(
            encoder.encode(
              "I can't help with that particular request. Try rephrasing, or ask about your portfolio, allocations, or holdings.",
            ),
          );
        }
      } catch {
        controller.enqueue(encoder.encode("\n\n[Something went wrong reaching the model. Please try again.]"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
