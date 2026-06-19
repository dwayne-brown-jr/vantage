import AppShell from "@/components/AppShell";
import { listHoldings } from "@/lib/repository";

// Reads the local SQLite database at request time (seeds it on first run).
export const dynamic = "force-dynamic";

export default function Home() {
  const holdings = listHoldings();
  return <AppShell initialHoldings={holdings} />;
}
