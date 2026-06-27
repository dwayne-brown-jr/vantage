import { NextResponse } from "next/server";

import { fetchHistory } from "@/lib/datasource";
import { computeTechnicals } from "@/lib/technicals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANGES = new Set(["6mo", "1y", "2y", "5y"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "").toUpperCase().trim();
  const range = url.searchParams.get("range") ?? "1y";

  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }
  const candles = await fetchHistory(symbol, RANGES.has(range) ? range : "1y");
  if (candles.length === 0) {
    return NextResponse.json({ symbol, candles: [], technicals: null, note: "No price history available." });
  }
  return NextResponse.json({ symbol, candles, technicals: computeTechnicals(candles) });
}
