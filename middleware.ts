import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

/**
 * Password gate for the whole app. When VANTAGE_PASSWORD is set (production),
 * every page and API route requires a valid session cookie; unauthenticated
 * requests are redirected to /login (pages) or rejected with 401 (APIs). When
 * the password is not set (local dev), the app is open.
 */
export const config = {
  matcher: ["/((?!login|api/auth|api/cron|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};

export async function middleware(req: NextRequest) {
  const password = process.env.VANTAGE_PASSWORD;

  if (!password) {
    // Fail closed on Netlify if someone forgot to configure a password.
    if (process.env.NETLIFY) {
      return new NextResponse("VANTAGE_PASSWORD is not configured on this deployment.", { status: 503 });
    }
    return NextResponse.next(); // local dev: open
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSession(password, token)) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}
