import { NextResponse } from "next/server";

import { createHolding, listHoldings } from "@/lib/repository";
import { holdingInputSchema } from "@/lib/schema";

// Native SQLite module → Node runtime, never statically cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ holdings: await listHoldings() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = holdingInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid holding", details: parsed.error.flatten() }, { status: 400 });
  }
  const holding = await createHolding(parsed.data);
  return NextResponse.json({ holding }, { status: 201 });
}
