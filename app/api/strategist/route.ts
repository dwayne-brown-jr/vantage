import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { listHoldings } from "@/lib/repository";
import { STRATEGIST_SYSTEM, buildStrategistContext } from "@/lib/strategist";

// Reads the local SQLite DB and the server-only ANTHROPIC_API_KEY → Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.VANTAGE_STRATEGIST_MODEL ?? "claude-sonnet-4-6";

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

/**
 * Turn a streaming failure into something a single user can act on. The stream
 * has already begun by the time this runs, so the only channel back to the UI
 * is the response body — a bare "try again" leaves no way to tell an expired
 * key from a bad model id from a platform timeout. Full detail also goes to the
 * function log. Safe to surface: the app is private and password-gated, and
 * Anthropic's errors never echo the API key.
 */
function describeStreamFailure(err: unknown): string {
  console.error("[strategist] stream failed:", err);

  if (err instanceof Anthropic.AuthenticationError) {
    return "the ANTHROPIC_API_KEY on this deployment was rejected (401). Check the key in Netlify \u2192 Site configuration \u2192 Environment variables.";
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return `this API key isn't allowed to use ${MODEL} or the web_search tool (403).`;
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "the API rate-limited this request (429). Wait a moment and ask again.";
  }
  if (err instanceof Anthropic.BadRequestError) {
    return `the API rejected the request (400): ${err.message}. Usually the model id (currently "${MODEL}") or the web_search tool version.`;
  }
  if (err instanceof Anthropic.APIError) {
    return `the API returned ${err.status ?? "an error"}: ${err.message}`;
  }
  if (err instanceof Error) {
    return `${err.name}: ${err.message}. A timeout here usually means the platform cut the function off before the answer finished \u2014 web search adds several seconds before the first word.`;
  }
  return "an unknown error occurred.";
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
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2048,
    system,
    // Server-side web search so the strategist can pull current headlines.
    tools: [{ type: "web_search_20260209", name: "web_search" }],
    messages: parsed.data.messages,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let wroteAnything = false;
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
            wroteAnything = true;
          }
        }
      } catch (err) {
        const detail = describeStreamFailure(err);
        const note = wroteAnything
          ? `\n\n[The answer was cut off \u2014 ${detail}]`
          : `[Couldn't reach the model \u2014 ${detail}]`;
        // The client may already be gone (navigated away, aborted); enqueueing
        // into a closed controller throws and would mask the original error.
        try {
          controller.enqueue(encoder.encode(note));
        } catch {
          /* client disconnected — the console.error above is the record */
        }
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
