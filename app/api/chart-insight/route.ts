import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.VANTAGE_STRATEGIST_MODEL ?? "claude-sonnet-4-6";

const bodySchema = z.object({
  symbol: z.string().min(1).max(12),
  name: z.string().max(120).optional(),
  technicals: z.object({
    last: z.number(),
    changePct: z.number(),
    sma50: z.number().nullable(),
    sma200: z.number().nullable(),
    rsi14: z.number().nullable(),
    rangeHigh: z.number(),
    rangeLow: z.number(),
    swingHigh: z.number(),
    swingLow: z.number(),
    fib: z.object({ f236: z.number(), f382: z.number(), f500: z.number(), f618: z.number() }),
    buyZone: z.tuple([z.number(), z.number()]),
  }),
});

const SYSTEM =
  "You are a concise technical analyst embedded in the owner's private dashboard. Given PRECOMPUTED levels for one stock, " +
  "explain in 2–4 short sentences where reasonable accumulation (buy) zones are and why, referencing ONLY the numbers " +
  "provided (price, 50/200-day moving averages, RSI, recent swing high/low, Fibonacci retracement, and the buy zone). " +
  "Never invent price targets or figures that aren't given. Note the obvious risk (a level can break). Plain prose, no " +
  "markdown headers. This is educational information, not investment advice.";

const usd = (n: number) => "$" + n.toFixed(2);

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 503 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { symbol, name, technicals: t } = parsed.data;
  const context = [
    `Symbol: ${symbol}${name ? ` (${name})` : ""}`,
    `Last price: ${usd(t.last)} (${t.changePct >= 0 ? "+" : ""}${t.changePct.toFixed(2)}% today)`,
    `50-day MA: ${t.sma50 != null ? usd(t.sma50) : "n/a"}; 200-day MA: ${t.sma200 != null ? usd(t.sma200) : "n/a"}`,
    `RSI(14): ${t.rsi14 != null ? t.rsi14.toFixed(0) : "n/a"}`,
    `Recent swing: low ${usd(t.swingLow)} → high ${usd(t.swingHigh)}; period range ${usd(t.rangeLow)}–${usd(t.rangeHigh)}`,
    `Fibonacci retracement: 38.2% ${usd(t.fib.f382)}, 50% ${usd(t.fib.f500)}, 61.8% ${usd(t.fib.f618)}`,
    `Computed buy zone: ${usd(t.buyZone[0])}–${usd(t.buyZone[1])}`,
  ].join("\n");

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: SYSTEM,
      messages: [{ role: "user", content: `${context}\n\nGive the buy-zone read for ${symbol}.` }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n\n")
      .trim();
    return NextResponse.json({ text: text || "No analysis available right now." });
  } catch {
    return NextResponse.json({ error: "Could not generate analysis." }, { status: 502 });
  }
}
