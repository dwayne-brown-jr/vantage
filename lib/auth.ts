/**
 * Session auth for the single owner. Uses only Web Crypto + standard globals
 * (no Node or CommonJS imports) so it is safe to import from edge middleware —
 * which is what keeps the Netlify Next 16 edge bundler happy.
 *
 * A session token is `${expiry}.${HMAC_SHA256(expiry)}`, signed with the
 * password as the key. No DB, no session store — verification is stateless.
 */
export const SESSION_COOKIE = "vantage_session";
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return base64url(new Uint8Array(sig));
}

/** True if `provided` matches `expected`, in roughly constant time. */
export function passwordMatches(provided: string, expected: string): boolean {
  return timingSafeEqual(provided, expected);
}

export async function createSessionToken(secret: string, ttlMs: number = DEFAULT_TTL_MS): Promise<string> {
  const expiry = String(Date.now() + ttlMs);
  return `${expiry}.${await sign(secret, expiry)}`;
}

export async function isValidSession(secret: string, token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const expiry = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^\d+$/.test(expiry) || Number(expiry) < Date.now()) return false;
  return timingSafeEqual(signature, await sign(secret, expiry));
}
