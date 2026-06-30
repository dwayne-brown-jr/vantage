import type { AssetClassKey, HoldingInput } from "@/lib/types";

/**
 * Broker CSV import — pure & isomorphic (runs in the browser before anything is
 * saved, so the file never leaves the machine until you confirm).
 *
 * Strategy: detect the broker by header signature, then map columns BY HEADER
 * NAME (not position) so column re-orderings don't break parsing. Cost basis is
 * resolved up to three ways to cover all three export shapes:
 *   1. an explicit total-cost column (Schwab, Fidelity)
 *   2. market value − total gain (E*Trade)
 *   3. average cost × quantity (fallback)
 */
export type BrokerFormat = "schwab" | "fidelity" | "etrade";

export interface ParsedImport {
  format: BrokerFormat;
  /** Suggested account label (editable by the user before saving). */
  accountLabel: string;
  holdings: HoldingInput[];
  warnings: string[];
}

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

const CASH_TICKERS = new Set(["CASH", "FCASH", "SPAXX", "FDRXX", "SWVXX", "VMFXX", "FZFXX", "FNSXX"]);

/* ── low-level parsing ───────────────────────────────────────────────────── */

/** RFC4180-ish tokenizer: handles quoted fields, embedded commas, and "" escapes. */
export function parseDelimited(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      endField();
    } else if (c === "\n") {
      endRow();
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) endRow();

  // Drop fully-blank lines.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** "$6,626.64" → 6626.64 · "($12.30)" → -12.3 · "--"/"N/A"/"" → NaN. */
export function parseNumber(raw: string | undefined): number {
  if (raw == null) return NaN;
  let s = raw.trim();
  if (s === "" || s === "--" || /^n\/?a$/i.test(s)) return NaN;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,%\s]/g, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (s === "") return NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return negative ? -n : n;
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

/* ── asset-class heuristics ──────────────────────────────────────────────── */

export function guessAssetClass(symbol: string, name: string): AssetClassKey {
  const s = symbol.toUpperCase();
  const n = name.toLowerCase();
  if (/cash|money market/.test(n) || CASH_TICKERS.has(s)) return "cash";
  if (/target|retirement|freedom|ret\.? blend|20\d\d/.test(n) || /20\d\d/.test(s)) return "tdf";
  if (/emerging/.test(n)) return "intl_em";
  if (/international|ex-?us|developed|world ex|global ex/.test(n)) return "intl_dev";
  if (/total stock|total market|broad market/.test(n)) return "us_total";
  if (/s&p ?500|500 index|large[ -]?cap|large company|fundamental us/.test(n)) return "us_large";
  if (/dividend/.test(n)) return "div_value";
  if (/health|aerospace|defense|semiconductor|biotech|energy|financials?|sector|utilit/.test(n)) return "sector";
  if (/spac|innovation|\bark\b|speculat|new issue/.test(n)) return "spec";
  // Five-letter mutual-fund symbols ending in X default to a US index blend.
  if (/^[A-Z]{4}X$/.test(s)) return "us_large";
  return "us_stock";
}

/* ── format detection ────────────────────────────────────────────────────── */

interface Detected {
  format: BrokerFormat;
  headerIndex: number;
  header: string[];
}

function detectFormat(rows: string[][]): Detected | null {
  for (let i = 0; i < rows.length; i++) {
    const cellList = rows[i]!.map(norm);
    const cells = new Set(cellList);
    const has = (...names: string[]) => names.every((nm) => cells.has(nm));
    const hasAny = (...names: string[]) => names.some((nm) => cells.has(nm));
    // Substring match: Schwab's web "Positions" export wraps headers, e.g.
    // "Mkt Val (Market Value)" and "Asset Type" instead of "Market Value".
    const hasLike = (...subs: string[]) => subs.some((sub) => cellList.some((c) => c.includes(sub)));

    if (hasLike("market value") && hasAny("security type", "cost basis", "asset type")) {
      return { format: "schwab", headerIndex: i, header: rows[i]! };
    }
    if (has("account number") && hasAny("current value", "cost basis total")) {
      return { format: "fidelity", headerIndex: i, header: rows[i]! };
    }
    if (hasAny("value $", "value") && hasAny("price paid $", "last price $")) {
      return { format: "etrade", headerIndex: i, header: rows[i]! };
    }
  }
  return null;
}

/** Build a normalized-header → column-index lookup. */
function columnFinder(header: string[]) {
  const index = new Map<string, number>();
  header.forEach((h, i) => {
    const key = norm(h);
    if (!index.has(key)) index.set(key, i);
  });
  const entries = [...index.entries()];
  return (candidates: string[]): number => {
    // Exact header match first.
    for (const c of candidates) {
      const idx = index.get(norm(c));
      if (idx != null) return idx;
    }
    // Fallback: a header that CONTAINS the candidate — handles Schwab's wrapped
    // headers like "Mkt Val (Market Value)" or "Qty (Quantity)". Most-specific
    // candidates are listed first, so they win.
    for (const c of candidates) {
      const key = norm(c);
      const hit = entries.find(([h]) => h.includes(key));
      if (hit) return hit[1];
    }
    return -1;
  };
}

/* ── main entry point ────────────────────────────────────────────────────── */

export function parseBrokerCsv(text: string): ParsedImport {
  const rows = parseDelimited(text);
  if (rows.length === 0) throw new CsvParseError("The file is empty.");

  const detected = detectFormat(rows);
  if (!detected) {
    throw new CsvParseError(
      "Unrecognized format. Expected a Schwab positions export, a Fidelity portfolio-positions export, or an E*Trade PortfolioDownload.",
    );
  }

  const { format, headerIndex, header } = detected;
  const find = columnFinder(header);

  const col = {
    symbol: find(["symbol"]),
    name: find(["description", "name", "security description"]),
    value: find(["market value", "current value", "value $", "value"]),
    costTotal: find(["cost basis", "cost basis total", "total cost"]),
    avgCost: find(["average cost basis", "price paid $", "cost per share"]),
    totalGain: find(["total gain $", "gain/loss $", "total gain/loss dollar"]),
    quantity: find(["quantity", "qty #", "qty", "shares"]),
    price: find(["price", "last price", "last price $"]),
    account: find(["account name"]),
  };

  const get = (row: string[], idx: number): string => (idx >= 0 && idx < row.length ? row[idx]!.trim() : "");

  const dataRows = rows.slice(headerIndex + 1);
  const holdings: HoldingInput[] = [];
  const warnings: string[] = [];
  let skippedSummary = 0;
  let skippedUnparsable = 0;

  let accountLabel =
    format === "etrade" ? "E*Trade — imported" : format === "fidelity" ? "Fidelity — imported" : "Schwab — imported";

  // Schwab preamble sometimes carries the account name.
  if (format === "schwab") {
    for (let i = 0; i < headerIndex; i++) {
      const m = rows[i]!.join(" ").match(/positions for(?: account)?\s+(.+?)\s+as of/i);
      if (m?.[1]) {
        accountLabel = `Schwab · ${m[1].trim()}`;
        break;
      }
    }
  }

  for (const row of dataRows) {
    const symbolRaw = get(row, col.symbol);
    const nameRaw = get(row, col.name);

    // Skip summary / total rows ("Account Total", "Positions Total", "TOTAL").
    // Note: "Cash & Cash Investments" is NOT skipped here — it's a real cash
    // position in Schwab's web export and is imported as CASH below.
    if (/(^|\s)totals?$/i.test(symbolRaw)) {
      skippedSummary++;
      continue;
    }

    const isCash =
      /cash|money market/i.test(symbolRaw) ||
      /cash|money market/i.test(nameRaw) ||
      CASH_TICKERS.has(symbolRaw.toUpperCase());

    const value = parseNumber(get(row, col.value));
    if (!Number.isFinite(value)) {
      // A row with no usable value is almost always a footer/disclaimer line.
      if (symbolRaw || nameRaw) skippedUnparsable++;
      continue;
    }

    const symbol = isCash ? "CASH" : symbolRaw.toUpperCase();
    if (!symbol) {
      skippedUnparsable++;
      continue;
    }
    const cleanName = nameRaw && nameRaw !== "--" ? nameRaw : "";
    const name = cleanName || (isCash ? "Cash & money market" : symbolRaw);

    const quantity = (() => {
      const q = parseNumber(get(row, col.quantity));
      return Number.isFinite(q) ? q : null;
    })();
    const price = (() => {
      const p = parseNumber(get(row, col.price));
      return Number.isFinite(p) ? p : null;
    })();

    // Resolve cost basis.
    let costBasis = 0;
    if (!isCash) {
      const total = parseNumber(get(row, col.costTotal));
      if (Number.isFinite(total)) {
        costBasis = total;
      } else {
        const gain = parseNumber(get(row, col.totalGain));
        if (Number.isFinite(gain)) {
          costBasis = value - gain;
        } else {
          const avg = parseNumber(get(row, col.avgCost));
          if (Number.isFinite(avg) && quantity != null) costBasis = avg * quantity;
        }
      }
    }

    const rowAccount = format === "fidelity" ? get(row, col.account) : "";

    holdings.push({
      account: rowAccount || accountLabel,
      symbol,
      name,
      value,
      costBasis: Number.isFinite(costBasis) ? costBasis : 0,
      assetClass: isCash ? "cash" : guessAssetClass(symbol, name),
      quantity,
      price,
      source: `${format}-csv`,
    });
  }

  // Prefer the broker's own account name when it provides one.
  if (format === "fidelity") {
    const named = holdings.find((h) => h.account && !h.account.endsWith("— imported"));
    if (named) accountLabel = named.account;
  }

  if (holdings.length === 0) {
    throw new CsvParseError("Detected the format, but found no positions to import.");
  }
  if (skippedSummary > 0) warnings.push(`Skipped ${skippedSummary} summary row${skippedSummary > 1 ? "s" : ""}.`);
  if (skippedUnparsable > 0)
    warnings.push(`Skipped ${skippedUnparsable} row${skippedUnparsable > 1 ? "s" : ""} with no usable value.`);

  return { format, accountLabel, holdings, warnings };
}
