import { NextResponse } from "next/server";

import { deleteHolding, updateHolding } from "@/lib/repository";
import { holdingPatchSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = holdingPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid patch", details: parsed.error.flatten() }, { status: 400 });
  }
  const holding = await updateHolding(id, parsed.data);
  if (!holding) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ holding });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const ok = await deleteHolding(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
