import { NextResponse } from "next/server";

import { refreshAndSnapshot } from "@/lib/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Refresh live prices. Sends only ticker symbols to the quote provider, applies
 * the quotes, persists, and captures a daily snapshot. Pass
 * { estimateShares: true } to derive share counts from current values.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { estimateShares?: boolean } | null;

  let result;
  try {
    result = await refreshAndSnapshot(body?.estimateShares === true);
  } catch {
    return NextResponse.json({ error: "Could not reach the price provider. Try again." }, { status: 502 });
  }

  return NextResponse.json({
    holdings: result.holdings,
    asOf: result.asOf,
    priced: result.priced,
    unresolved: [...new Set(result.unresolved)],
    valueUpdated: result.valueUpdated,
  });
}
