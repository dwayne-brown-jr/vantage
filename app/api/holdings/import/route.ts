import { NextResponse } from "next/server";

import { bulkInsertHoldings } from "@/lib/repository";
import { importSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Commit a batch of parsed holdings. The CSV file itself never reaches the
 * server — the client parses it locally and posts only the confirmed rows.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid import", details: parsed.error.flatten() }, { status: 400 });
  }
  const holdings = bulkInsertHoldings(parsed.data.holdings);
  return NextResponse.json({ holdings, count: holdings.length }, { status: 201 });
}
