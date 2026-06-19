import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db";
import type { Holding, HoldingInput } from "@/lib/types";

/**
 * Typed data access for holdings (server-only). All SQL lives here; callers work
 * in terms of the Holding domain type. snake_case columns ↔ camelCase fields are
 * mapped in one place.
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

const COLUMNS =
  "id, account, symbol, name, value, cost_basis, asset_class, quantity, price, source, updated_at";
const VALUES =
  "@id, @account, @symbol, @name, @value, @cost_basis, @asset_class, @quantity, @price, @source, @updated_at";

export function listHoldings(): Holding[] {
  const rows = getDb().prepare(`SELECT ${COLUMNS} FROM holdings`).all() as HoldingRow[];
  return rows.map(rowToHolding);
}

export function getHolding(id: string): Holding | null {
  const row = getDb().prepare(`SELECT ${COLUMNS} FROM holdings WHERE id = ?`).get(id) as
    | HoldingRow
    | undefined;
  return row ? rowToHolding(row) : null;
}

/** Materialize a HoldingInput into a full Holding, assigning id/timestamp. */
function materialize(input: HoldingInput): Holding {
  return {
    id: input.id ?? randomUUID(),
    account: input.account,
    symbol: input.symbol,
    name: input.name ?? "",
    value: input.value,
    costBasis: input.costBasis,
    assetClass: input.assetClass,
    quantity: input.quantity ?? null,
    price: input.price ?? null,
    source: input.source ?? "manual",
    updatedAt: new Date().toISOString(),
  };
}

export function createHolding(input: HoldingInput): Holding {
  const holding = materialize(input);
  getDb()
    .prepare(`INSERT INTO holdings (${COLUMNS}) VALUES (${VALUES})`)
    .run(holdingToRow(holding));
  return holding;
}

export function updateHolding(id: string, patch: Partial<HoldingInput>): Holding | null {
  const existing = getHolding(id);
  if (!existing) return null;
  const updated: Holding = {
    ...existing,
    ...patch,
    id, // id is immutable
    updatedAt: new Date().toISOString(),
  };
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
}

export function deleteHolding(id: string): boolean {
  const info = getDb().prepare("DELETE FROM holdings WHERE id = ?").run(id);
  return info.changes > 0;
}

/** Bulk-insert (used by CSV import after the user confirms). Atomic. */
export function bulkInsertHoldings(inputs: HoldingInput[]): Holding[] {
  const db = getDb();
  const insert = db.prepare(`INSERT INTO holdings (${COLUMNS}) VALUES (${VALUES})`);
  const created: Holding[] = [];
  const tx = db.transaction(() => {
    for (const input of inputs) {
      const holding = materialize(input);
      insert.run(holdingToRow(holding));
      created.push(holding);
    }
  });
  tx();
  return created;
}
