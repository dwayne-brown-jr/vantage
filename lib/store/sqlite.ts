import { getDb } from "@/lib/db";
import { materialize } from "@/lib/store/shared";
import type { HoldingStore } from "@/lib/store/types";
import type { Holding } from "@/lib/types";

/**
 * Local SQLite backend (better-sqlite3). Used for `npm run dev` and anywhere
 * that isn't Netlify. Synchronous under the hood, wrapped in the async store
 * interface. This module is dynamically imported so the native dependency is
 * never pulled into the serverless bundle.
 */
interface HoldingRow {
  id: string;
  account: string;
  symbol: string;
  name: string;
  value: number;
  cost_basis: number;
  asset_class: string;
  quantity: number | null;
  price: number | null;
  source: string | null;
  updated_at: string | null;
}

function rowToHolding(row: HoldingRow): Holding {
  return {
    id: row.id,
    account: row.account,
    symbol: row.symbol,
    name: row.name,
    value: row.value,
    costBasis: row.cost_basis,
    assetClass: row.asset_class as Holding["assetClass"],
    quantity: row.quantity,
    price: row.price,
    source: row.source,
    updatedAt: row.updated_at,
  };
}

function holdingToRow(h: Holding): HoldingRow {
  return {
    id: h.id,
    account: h.account,
    symbol: h.symbol,
    name: h.name,
    value: h.value,
    cost_basis: h.costBasis,
    asset_class: h.assetClass,
    quantity: h.quantity ?? null,
    price: h.price ?? null,
    source: h.source ?? null,
    updated_at: h.updatedAt ?? null,
  };
}

const COLUMNS = "id, account, symbol, name, value, cost_basis, asset_class, quantity, price, source, updated_at";
const VALUES = "@id, @account, @symbol, @name, @value, @cost_basis, @asset_class, @quantity, @price, @source, @updated_at";

function getRow(id: string): Holding | null {
  const row = getDb().prepare(`SELECT ${COLUMNS} FROM holdings WHERE id = ?`).get(id) as HoldingRow | undefined;
  return row ? rowToHolding(row) : null;
}

export const sqliteStore: HoldingStore = {
  async list() {
    const rows = getDb().prepare(`SELECT ${COLUMNS} FROM holdings`).all() as HoldingRow[];
    return rows.map(rowToHolding);
  },

  async create(input) {
    const holding = materialize(input);
    getDb().prepare(`INSERT INTO holdings (${COLUMNS}) VALUES (${VALUES})`).run(holdingToRow(holding));
    return holding;
  },

  async update(id, patch) {
    const existing = getRow(id);
    if (!existing) return null;
    const updated: Holding = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    getDb()
      .prepare(
        `UPDATE holdings SET
           account=@account, symbol=@symbol, name=@name, value=@value,
           cost_basis=@cost_basis, asset_class=@asset_class, quantity=@quantity,
           price=@price, source=@source, updated_at=@updated_at
         WHERE id=@id`,
      )
      .run(holdingToRow(updated));
    return updated;
  },

  async remove(id) {
    return getDb().prepare("DELETE FROM holdings WHERE id = ?").run(id).changes > 0;
  },

  async bulkInsert(inputs) {
    const db = getDb();
    const insert = db.prepare(`INSERT INTO holdings (${COLUMNS}) VALUES (${VALUES})`);
    const created: Holding[] = [];
    db.transaction(() => {
      for (const input of inputs) {
        const holding = materialize(input);
        insert.run(holdingToRow(holding));
        created.push(holding);
      }
    })();
    return created;
  },

  async replaceAll(holdings) {
    const db = getDb();
    const insert = db.prepare(`INSERT INTO holdings (${COLUMNS}) VALUES (${VALUES})`);
    db.transaction(() => {
      db.prepare("DELETE FROM holdings").run();
      for (const h of holdings) insert.run(holdingToRow(h));
    })();
    return holdings;
  },
};
