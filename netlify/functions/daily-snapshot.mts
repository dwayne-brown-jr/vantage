// Netlify scheduled function — runs once a day and asks the app to refresh
// prices and record a snapshot. Authenticated to the internal cron route via
// CRON_SECRET. No-ops cleanly if URL/CRON_SECRET aren't configured.
export default async () => {
  const base = process.env.URL ?? process.env.DEPLOY_PRIME_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    return new Response("daily-snapshot: not configured (need URL + CRON_SECRET)", { status: 200 });
  }
  const res = await fetch(`${base}/api/cron/snapshot`, {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });
  return new Response(`daily-snapshot: ${res.status}`, { status: 200 });
};

export const config = { schedule: "@daily" };
