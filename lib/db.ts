import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";

import { SEED_HOLDINGS } from "@/lib/seed";

/**
 * Local SQLite connection (server-only). The database file lives on this
 * machine and is gitignored — financial data never leaves the device.
 *
 * A single connection is cached on globalThis so Next's dev hot-reload doesn't
 * open a new handle on every change.
 */
const DB_PATH = process.env.VANTAGE_DB_PATH ?? resolve(process.cwd(), "data", "vantage.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS holdings (
  id          TEXT PRIMARY KEY,
  account     TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  value       REAL NOT NULL DEFAULT 0,
  cost_basis  REAL NOT NULL DEFAULT 0,
  asset_class TEXT NOT NULL,
  quantity    REAL,
  price       REAL,
  source      TEXT,
  updated_at  TEXT
);
`;

const globalForDb = globalThis as unknown as { __vantageDb?: Database.Database };

export function getDb(): Database.Database {
  if (globalForDb.__vantageDb) return globalForDb.__vantageDb;

  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);

  seedIfEmpty(db);

  globalForDb.__vantageDb = db;
  return db;
}

/** On a fresh database, load the real seed holdings so the app is never empty. */
function seedIfEmpty(db: Database.Database): void {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM holdings").get() as { n: number };
  if (n > 0) return;

  const insert = db.prepare(
    `INSERT INTO holdings (id, account, symbol, name, value, cost_basis, asset_class, quantity, price, source, updated_at)
     VALUES (@id, @account, @symbol, @name, @value, @cost_basis, @asset_class, @quantity, @price, @source, @updated_at)`,
  );
  const seedTx = db.transaction(() => {
    for (const h of SEED_HOLDINGS) {
      insert.run({
        id: h.id,
        account: h.account,
        symbol: h.symbol,
        name: h.name,
        value: h.value,
        cost_basis: h.costBasis,
        asset_class: h.assetClass,
        quantity: h.quantity ?? null,
        price: h.price ?? null,
        source: h.source ?? "seed",
        updated_at: h.updatedAt ?? null,
      });
    }
  });
  seedTx();
}
