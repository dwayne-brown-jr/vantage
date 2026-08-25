import { describe, expect, it } from "vitest";

import { holdingInputSchema, holdingPatchSchema } from "@/lib/schema";

describe("holdingPatchSchema", () => {
  it("does not inject an empty name into a value-only patch", () => {
    // zod keeps `.default()` through `.partial()`, so without an explicit
    // override every partial update would blank the stored name.
    const parsed = holdingPatchSchema.parse({ value: 1234.5 });
    expect(parsed).toEqual({ value: 1234.5 });
    expect("name" in parsed).toBe(false);
  });

  it("still accepts a name when one is given", () => {
    expect(holdingPatchSchema.parse({ name: "NVIDIA" }).name).toBe("NVIDIA");
  });

  it("allows deliberately clearing a name", () => {
    expect(holdingPatchSchema.parse({ name: "" }).name).toBe("");
  });

  it("leaves other omitted fields absent", () => {
    const parsed = holdingPatchSchema.parse({ costBasis: 10 });
    expect(Object.keys(parsed)).toEqual(["costBasis"]);
  });
});

describe("holdingInputSchema", () => {
  it("still defaults name on a full create, where a name may legitimately be absent", () => {
    const parsed = holdingInputSchema.parse({
      account: "Roth",
      symbol: "VTI",
      value: 100,
      costBasis: 90,
      assetClass: "us_total",
    });
    expect(parsed.name).toBe("");
  });
});
