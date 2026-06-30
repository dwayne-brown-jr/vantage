import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CsvParseError, parseBrokerCsv, parseDelimited, parseNumber, guessAssetClass } from "@/lib/csv";

const fixture = (name: string): string => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

describe("parseNumber()", () => {
  it("strips currency, commas, and percent signs", () => {
    expect(parseNumber("$6,626.64")).toBeCloseTo(6626.64, 2);
    expect(parseNumber("+$1,462.74")).toBeCloseTo(1462.74, 2);
    expect(parseNumber("25.04%")).toBeCloseTo(25.04, 2);
    expect(parseNumber("1402.60")).toBeCloseTo(1402.6, 2);
  });
  it("treats parentheses as negative", () => {
    expect(parseNumber("($123.45)")).toBeCloseTo(-123.45, 2);
  });
  it("returns NaN for empty / placeholder values", () => {
    expect(parseNumber("--")).toBeNaN();
    expect(parseNumber("")).toBeNaN();
    expect(parseNumber("N/A")).toBeNaN();
    expect(parseNumber(undefined)).toBeNaN();
  });
});

describe("parseDelimited()", () => {
  it("handles quoted fields with embedded commas", () => {
    const rows = parseDelimited('a,"1,234",c\n"x""y",z');
    expect(rows[0]).toEqual(["a", "1,234", "c"]);
    expect(rows[1]).toEqual(['x"y', "z"]);
  });
  it("drops blank lines", () => {
    expect(parseDelimited("a,b\n\n\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("guessAssetClass()", () => {
  it("classifies by symbol/name keywords", () => {
    expect(guessAssetClass("SWPPX", "Schwab S&P 500 Index")).toBe("us_large");
    expect(guessAssetClass("SWISX", "Schwab International Index")).toBe("intl_dev");
    expect(guessAssetClass("SCHE", "Schwab Emerging Markets")).toBe("intl_em");
    expect(guessAssetClass("TRP2060", "T. Rowe Price Ret. Blend 2060")).toBe("tdf");
    expect(guessAssetClass("SCHD", "US Dividend Equity ETF")).toBe("div_value");
    expect(guessAssetClass("CASH", "Cash & Money Market")).toBe("cash");
    expect(guessAssetClass("NVDA", "NVIDIA Corp")).toBe("us_stock");
  });
});

describe("Schwab positions import", () => {
  const result = parseBrokerCsv(fixture("schwab-positions.csv"));

  it("detects the Schwab format and account label", () => {
    expect(result.format).toBe("schwab");
    expect(result.accountLabel).toContain("Schwab");
  });
  it("imports 5 positions + cash, skipping the Account Total row", () => {
    expect(result.holdings).toHaveLength(6);
    expect(result.warnings.join(" ")).toMatch(/summary/i);
  });
  it("maps value, cost basis, and class correctly", () => {
    const swppx = result.holdings.find((h) => h.symbol === "SWPPX")!;
    expect(swppx.value).toBeCloseTo(6626.64, 2);
    expect(swppx.costBasis).toBeCloseTo(3687.92, 2);
    expect(swppx.assetClass).toBe("us_large");

    const cash = result.holdings.find((h) => h.symbol === "CASH")!;
    expect(cash.assetClass).toBe("cash");
    expect(cash.value).toBeCloseTo(212.08, 2);
    expect(cash.costBasis).toBe(0);

    expect(result.holdings.find((h) => h.symbol === "SWISX")!.assetClass).toBe("intl_dev");
    expect(result.holdings.find((h) => h.symbol === "SCHD")!.assetClass).toBe("div_value");
  });
});

describe("Schwab web 'Positions' export (wrapped headers)", () => {
  const result = parseBrokerCsv(fixture("schwab-positions-webexport.csv"));

  it("detects Schwab despite 'Mkt Val (Market Value)' / 'Asset Type' headers", () => {
    expect(result.format).toBe("schwab");
    expect(result.accountLabel).toContain("Schwab");
    expect(result.accountLabel).toContain("Individual");
  });

  it("imports the positions + cash, skipping the 'Positions Total' row", () => {
    // AAPL, NVDA, SWPPX, CASH — not "Positions Total".
    expect(result.holdings).toHaveLength(4);
    expect(result.holdings.some((h) => /total/i.test(h.symbol))).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/summary/i);
  });

  it("resolves value and cost basis from the wrapped/variant columns", () => {
    const swppx = result.holdings.find((h) => h.symbol === "SWPPX")!;
    expect(swppx.value).toBeCloseTo(6527.88, 2);
    expect(swppx.costBasis).toBeCloseTo(3687.92, 2);
    expect(swppx.assetClass).toBe("us_large");

    const aapl = result.holdings.find((h) => h.symbol === "AAPL")!;
    expect(aapl.value).toBeCloseTo(281.27, 2);
    expect(aapl.costBasis).toBeCloseTo(129.47, 2);
  });

  it("imports 'Cash & Cash Investments' as a CASH position", () => {
    const cash = result.holdings.find((h) => h.symbol === "CASH")!;
    expect(cash).toBeDefined();
    expect(cash.value).toBeCloseTo(263.29, 2);
    expect(cash.assetClass).toBe("cash");
    expect(cash.costBasis).toBe(0);
    expect(cash.name).toBe("Cash & money market"); // not the raw "--"
  });
});

describe("Fidelity positions import", () => {
  const result = parseBrokerCsv(fixture("fidelity-positions.csv"));

  it("detects Fidelity and uses the Account Name as the label", () => {
    expect(result.format).toBe("fidelity");
    expect(result.accountLabel).toBe("TESLA 401(K)");
  });
  it("parses comma-bearing quoted currency and the TDF class", () => {
    expect(result.holdings).toHaveLength(2);
    const tdf = result.holdings.find((h) => h.symbol === "TRP2060")!;
    expect(tdf.value).toBeCloseTo(17742.81, 2);
    expect(tdf.costBasis).toBeCloseTo(16280.07, 2);
    expect(tdf.assetClass).toBe("tdf");
    expect(tdf.account).toBe("TESLA 401(K)");
    expect(result.holdings.find((h) => h.symbol === "SP500")!.assetClass).toBe("us_large");
  });
  it("skips the Pending Activity row with a warning", () => {
    expect(result.warnings.join(" ")).toMatch(/no usable value/i);
  });
});

describe("E*Trade PortfolioDownload import", () => {
  const result = parseBrokerCsv(fixture("etrade-portfoliodownload.csv"));

  it("detects E*Trade and derives cost basis from value − total gain", () => {
    expect(result.format).toBe("etrade");
    expect(result.holdings).toHaveLength(3);

    const spcx = result.holdings.find((h) => h.symbol === "SPCX")!;
    expect(spcx.value).toBeCloseTo(577.5, 2);
    expect(spcx.costBasis).toBeCloseTo(461.84, 2); // 577.50 − 115.66

    const amzn = result.holdings.find((h) => h.symbol === "AMZN")!;
    expect(amzn.costBasis).toBeCloseTo(226.72, 2); // 492.19 − 265.47

    expect(result.holdings.find((h) => h.symbol === "CASH")!.assetClass).toBe("cash");
  });
  it("skips the TOTAL summary row", () => {
    expect(result.warnings.join(" ")).toMatch(/summary/i);
  });
});

describe("unrecognized files", () => {
  it("throws CsvParseError on garbage", () => {
    expect(() => parseBrokerCsv("foo,bar,baz\n1,2,3")).toThrow(CsvParseError);
  });
  it("throws CsvParseError on an empty file", () => {
    expect(() => parseBrokerCsv("")).toThrow(CsvParseError);
  });
});
