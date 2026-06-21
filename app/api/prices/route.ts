import { NextResponse } from "next/server";

import { getDataSource } from "@/lib/datasource";
import { repriceHoldings } from "@/lib/prices";
import { listHoldings, replaceAllHoldings } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Refresh live prices. Sends only ticker symbols to the quote provider, applies
 * the quotes, and persists the updated holdings. Pass { estimateShares: true }
 * to derive share counts from current values for holdings that don't have one.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { estimateShares?: boolean } | null;
  const estimateShares = body?.estimateShares === true;

  const holdings = await listHoldings();
  const symbols = [...new Set(holdings.filter((h) => h.assetClass !== "cash").map((h) => h.symbol.toUpperCase()))];

  let quotes;
  try {
    quotes = await getDataSource().fetchQuotes(symbols);
  } catch {
    return NextResponse.json({ error: "Could not reach the price provider. Try again." }, { status: 502 });
  }

  const result = repriceHoldings(holdings, quotes, { estimateShares });
  await replaceAllHoldings(result.holdings);

  return NextResponse.json({
    holdings: result.holdings,
    asOf: new Date().toISOString(),
    priced: result.priced,
    unresolved: [...new Set(result.unresolved)],
    valueUpdated: result.valueUpdated,
  });
}
