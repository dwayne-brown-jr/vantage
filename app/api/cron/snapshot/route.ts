import { NextResponse } from "next/server";

import { refreshAndSnapshot } from "@/lib/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduled daily job: refresh prices + record a snapshot. Excluded from the
 * password gate (it's machine-to-machine) and protected by CRON_SECRET instead.
 * Called by the Netlify scheduled function in netlify/functions/daily-snapshot.
 */
async function run(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const r = await refreshAndSnapshot(false);
    return NextResponse.json({ ok: true, asOf: r.asOf, priced: r.priced.length, day: r.snapshot?.day ?? null });
  } catch {
    return NextResponse.json({ ok: false, error: "refresh failed" }, { status: 502 });
  }
}

export const POST = run;
export const GET = run;
