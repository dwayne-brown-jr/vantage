import { NextResponse } from "next/server";

import { SESSION_COOKIE, createSessionToken, passwordMatches } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const password = process.env.VANTAGE_PASSWORD;
  if (!password) return NextResponse.json({ ok: true, open: true });

  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const provided = typeof body?.password === "string" ? body.password : "";

  if (!provided || !passwordMatches(provided, password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const secure = req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:";
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(password), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
