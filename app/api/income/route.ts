import { NextResponse } from "next/server";

import { fetchDividendRates } from "@/lib/datasource";
import { portfolioGrowth } from "@/lib/growth";
import { buildIncome } from "@/lib/income";
import { listHoldings, listSnapshots } from "@/lib/repository";

// Reads the holdings store and calls out to the quote provider → Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Growth and income for the Overview tab.
 *
 * Only ticker symbols leave the server — never values, share counts, or
 * account names, the same contract as the price feed.
 */
export async function GET() {
  try {
    const [holdings, snapshots] = await Promise.all([listHoldings(), listSnapshots()]);

    // One request per distinct non-cash symbol.
    const symbols = [...new Set(holdings.filter((h) => h.assetClass !== "cash").map((h) => h.symbol))];
    const rates = await fetchDividendRates(symbols);

    return NextResponse.json({
      income: buildIncome(holdings, rates),
      growth: portfolioGrowth(snapshots),
    });
  } catch (e) {
    console.error("[income] failed:", e);
    return NextResponse.json(
      { error: "Couldn't load growth and income.", message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
