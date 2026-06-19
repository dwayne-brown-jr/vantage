import AppShell from "@/components/AppShell";
import { listHoldings } from "@/lib/repository";

// Reads the local SQLite database at request time (seeds it on first run).
export const dynamic = "force-dynamic";

export default async function Home() {
  const holdings = await listHoldings();
  return <AppShell initialHoldings={holdings} authEnabled={Boolean(process.env.VANTAGE_PASSWORD)} />;
}
