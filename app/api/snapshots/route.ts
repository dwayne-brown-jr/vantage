import { NextResponse } from "next/server";

import { listSnapshots, recordCurrentSnapshot } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ snapshots: await listSnapshots() });
}

export async function POST() {
  const snapshot = await recordCurrentSnapshot();
  return NextResponse.json({ snapshot, snapshots: await listSnapshots() }, { status: 201 });
}
