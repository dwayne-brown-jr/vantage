import type { Holding } from "@/lib/types";

/**
 * Real seed holdings, ported from the prototype (Vantage.jsx). Used to seed an
 * empty database on first run and to anchor the analytics unit tests.
 *
 * Field mapping vs. prototype: acct→account, sym→symbol, cost→costBasis,
 * cls→assetClass. Values are manual snapshots; TSLA RSUs (~$30k) is an estimate.
 */
export const ACCOUNTS = {
  taxable: "Schwab · Individual (taxable)",
  roth: "Schwab · Roth IRA",
  etrade: "E*Trade",
  k401: "Fidelity · Tesla 401(k)",
  rsu: "Tesla · RSUs",
} as const;

export const SEED_HOLDINGS: Holding[] = [
  // ── Schwab · Individual (taxable) ──
  { id: "t1", account: ACCOUNTS.taxable, symbol: "SWPPX", name: "Schwab S&P 500 Index", value: 6626.64, costBasis: 3687.92, assetClass: "us_large", source: "manual" },
  { id: "t2", account: ACCOUNTS.taxable, symbol: "SWTSX", name: "Schwab Total Stock Market", value: 707.01, costBasis: 398.19, assetClass: "us_total", source: "manual" },
  { id: "t3", account: ACCOUNTS.taxable, symbol: "NVDA", name: "NVIDIA", value: 635.84, costBasis: 556.34, assetClass: "us_stock", source: "manual" },
  { id: "t4", account: ACCOUNTS.taxable, symbol: "AAPL", name: "Apple", value: 296.34, costBasis: 129.47, assetClass: "us_stock", source: "manual" },
  { id: "t5", account: ACCOUNTS.taxable, symbol: "SCHB", name: "Schwab US Broad Market ETF", value: 175.09, costBasis: 73.7, assetClass: "us_large", source: "manual" },
  { id: "t6", account: ACCOUNTS.taxable, symbol: "SCHD", name: "Schwab US Dividend Equity", value: 97.92, costBasis: 69.64, assetClass: "div_value", source: "manual" },
  { id: "t7", account: ACCOUNTS.taxable, symbol: "SWISX", name: "Schwab International Index", value: 87.95, costBasis: 85.0, assetClass: "intl_dev", source: "manual" },
  { id: "t8", account: ACCOUNTS.taxable, symbol: "ARKK", name: "ARK Innovation ETF", value: 79.6, costBasis: 56.72, assetClass: "spec", source: "manual" },
  { id: "t9", account: ACCOUNTS.taxable, symbol: "DHC", name: "Diversified Healthcare REIT", value: 43.35, costBasis: 29.6, assetClass: "spec", source: "manual" },
  { id: "t10", account: ACCOUNTS.taxable, symbol: "CASH", name: "Cash & money market", value: 212.08, costBasis: 0, assetClass: "cash", source: "manual" },

  // ── Schwab · Roth IRA ──
  { id: "r1", account: ACCOUNTS.roth, symbol: "SWPPX", name: "Schwab S&P 500 Index", value: 6693.79, costBasis: 3829.23, assetClass: "us_large", source: "manual" },
  { id: "r2", account: ACCOUNTS.roth, symbol: "SWTSX", name: "Schwab Total Stock Market", value: 6531.67, costBasis: 3864.57, assetClass: "us_total", source: "manual" },
  { id: "r3", account: ACCOUNTS.roth, symbol: "NVDA", name: "NVIDIA", value: 2123.72, costBasis: 324.78, assetClass: "us_stock", source: "manual" },
  { id: "r4", account: ACCOUNTS.roth, symbol: "XAR", name: "SPDR S&P Aerospace & Defense", value: 587.35, costBasis: 191.34, assetClass: "sector", source: "manual" },
  { id: "r5", account: ACCOUNTS.roth, symbol: "SFLNX", name: "Schwab Fundamental US Large Co", value: 441.96, costBasis: 194.67, assetClass: "us_large", source: "manual" },
  { id: "r6", account: ACCOUNTS.roth, symbol: "CSCO", name: "Cisco Systems", value: 286.15, costBasis: 112.18, assetClass: "us_stock", source: "manual" },
  { id: "r7", account: ACCOUNTS.roth, symbol: "SCHD", name: "Schwab US Dividend Equity", value: 195.84, costBasis: 139.28, assetClass: "div_value", source: "manual" },
  { id: "r8", account: ACCOUNTS.roth, symbol: "ARKK", name: "ARK Innovation ETF", value: 159.2, costBasis: 290.6, assetClass: "spec", source: "manual" },
  { id: "r9", account: ACCOUNTS.roth, symbol: "SWHFX", name: "Schwab Health Care", value: 155.11, costBasis: 157.72, assetClass: "sector", source: "manual" },
  { id: "r10", account: ACCOUNTS.roth, symbol: "SCHE", name: "Schwab Emerging Markets Equity", value: 109.8, costBasis: 105.05, assetClass: "intl_em", source: "manual" },
  { id: "r11", account: ACCOUNTS.roth, symbol: "CASH", name: "Cash & money market", value: 320.38, costBasis: 0, assetClass: "cash", source: "manual" },

  // ── E*Trade ──
  { id: "e1", account: ACCOUNTS.etrade, symbol: "SPCX", name: "SPAC & New Issue ETF", value: 577.5, costBasis: 461.84, assetClass: "spec", source: "manual" },
  { id: "e2", account: ACCOUNTS.etrade, symbol: "AMZN", name: "Amazon", value: 492.19, costBasis: 226.72, assetClass: "us_stock", source: "manual" },
  { id: "e3", account: ACCOUNTS.etrade, symbol: "CASH", name: "Cash", value: 332.91, costBasis: 0, assetClass: "cash", source: "manual" },

  // ── Fidelity · Tesla 401(k) ──
  { id: "k1", account: ACCOUNTS.k401, symbol: "TRP2060", name: "T. Rowe Price Ret. Blend 2060 (target-date)", value: 17742.81, costBasis: 16280.07, assetClass: "tdf", source: "manual" },
  { id: "k2", account: ACCOUNTS.k401, symbol: "SP500", name: "S&P 500 Index PL CL C", value: 17471.31, costBasis: 13974.02, assetClass: "us_large", source: "manual" },

  // ── Tesla · RSUs ──
  { id: "x1", account: ACCOUNTS.rsu, symbol: "TSLA", name: "Tesla RSUs (approx.)", value: 30000, costBasis: 30000, assetClass: "us_stock", source: "manual" },
];
