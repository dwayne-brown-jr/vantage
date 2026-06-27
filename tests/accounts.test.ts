import { describe, expect, it } from "vitest";

import { classifyAccount } from "@/lib/accounts";
import { ACCOUNTS } from "@/lib/seed";

describe("classifyAccount — tax treatment of the real accounts", () => {
  it("Roth is tax-free to rebalance", () => {
    const t = classifyAccount(ACCOUNTS.roth);
    expect(t.treatment).toBe("roth");
    expect(t.taxFreeToRebalance).toBe(true);
  });

  it("the 401(k) is tax-deferred and tax-free to rebalance", () => {
    const t = classifyAccount(ACCOUNTS.k401);
    expect(t.treatment).toBe("traditional");
    expect(t.taxFreeToRebalance).toBe(true);
  });

  it("the individual brokerage is taxable", () => {
    const t = classifyAccount(ACCOUNTS.taxable);
    expect(t.treatment).toBe("taxable");
    expect(t.taxFreeToRebalance).toBe(false);
  });

  it("E*Trade defaults to taxable", () => {
    expect(classifyAccount(ACCOUNTS.etrade).treatment).toBe("taxable");
  });

  it("RSUs are classified as rsu", () => {
    const t = classifyAccount(ACCOUNTS.rsu);
    expect(t.treatment).toBe("rsu");
    expect(t.taxFreeToRebalance).toBe(false);
  });
});
