#!/usr/bin/env node
/**
 * Build an isolated staging database containing a shocked copy of the real
 * portfolio, so the strategist actually SEES the crash it is being asked about.
 *
 * Without this the harness is measuring the wrong thing: the server reasons
 * over the true holdings while the checker validates against shocked ones, so
 * every correct sell looks like an oversell. Never writes to the real database.
 *
 *   node scripts/seed-shocked-db.mjs <scenario-id> <out.db>
 */
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import Database from "better-sqlite3";

const [scenarioId, outPath] = process.argv.slice(2);
if (!scenarioId || !outPath) {
  console.error("usage: node scripts/seed-shocked-db.mjs <scenario-id> <out.db>");
  process.exit(1);
}

const { SCENARIOS, applyShock } = await import("../lib/stress.ts");
const scenario = SCENARIOS.find((s) => s.id === scenarioId);
if (!scenario) {
  console.error(`unknown scenario "${scenarioId}". Known: ${SCENARIOS.map((s) => s.id).join(", ")}`);
  process.exit(1);
}

const SRC = process.env.VANTAGE_SOURCE_DB ?? resolve(process.cwd(), "data", "vantage.db");
if (!existsSync(SRC)) {
  console.error(`source database not found: ${SRC}`);
  process.exit(1);
}

for (const suffix of ["", "-wal", "-shm"]) {
  if (existsSync(outPath + suffix)) rmSync(outPath + suffix);
}
// A plain file copy is not enough: the database runs in WAL mode, so recent
// commits live in the -wal sidecar and a copied .db can arrive empty.
// VACUUM INTO writes a single consistent, fully checkpointed copy.
const source = new Database(SRC, { readonly: true });
source.prepare("VACUUM INTO ?").run(outPath);
source.close();

const db = new Database(outPath);
const rows = db.prepare("SELECT * FROM holdings").all();
const holdings = rows.map((r) => ({
  id: r.id,
  account: r.account,
  symbol: r.symbol,
  name: r.name,
  value: r.value,
  costBasis: r.cost_basis,
  assetClass: r.asset_class,
  quantity: r.quantity,
  price: r.price,
  unvested: r.unvested,
}));

const shocked = applyShock(holdings, scenario.shock);
const update = db.prepare("UPDATE holdings SET value=?, price=?, unvested=? WHERE id=?");
const tx = db.transaction(() => {
  for (const h of shocked) update.run(h.value, h.price, h.unvested ?? null, h.id);
});
tx();

// Snapshots would otherwise describe the un-shocked past and confuse growth.
db.prepare("DELETE FROM snapshots").run();

const before = holdings.reduce((s, h) => s + h.value, 0);
const after = shocked.reduce((s, h) => s + h.value, 0);
console.log(`scenario   : ${scenario.label}`);
console.log(`portfolio  : $${before.toLocaleString(undefined, { maximumFractionDigits: 2 })} -> $${after.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
console.log(`drawdown   : ${(((after - before) / before) * 100).toFixed(1)}%`);
console.log(`written to : ${outPath}`);
db.close();
