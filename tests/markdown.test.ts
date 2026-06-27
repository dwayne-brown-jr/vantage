import { describe, expect, it } from "vitest";

import { parseMarkdown } from "@/lib/markdown";

describe("parseMarkdown — block parsing", () => {
  it("parses headings of levels 1–3", () => {
    const blocks = parseMarkdown("# One\n## Two\n### Three");
    expect(blocks).toEqual([
      { type: "h", level: 1, text: "One" },
      { type: "h", level: 2, text: "Two" },
      { type: "h", level: 3, text: "Three" },
    ]);
  });

  it("gathers wrapped lines into one paragraph and splits on blank lines", () => {
    const blocks = parseMarkdown("alpha\nbeta\n\ngamma");
    expect(blocks).toEqual([
      { type: "p", text: "alpha\nbeta" },
      { type: "p", text: "gamma" },
    ]);
  });

  it("parses unordered and ordered lists", () => {
    expect(parseMarkdown("- a\n- b")).toEqual([{ type: "ul", items: ["a", "b"] }]);
    expect(parseMarkdown("1. a\n2. b")).toEqual([{ type: "ol", items: ["a", "b"] }]);
  });

  it("parses a GFM pipe table with alignment", () => {
    const src = "| Account | Amount |\n| :--- | ---: |\n| Roth | $500 |\n| Taxable | $250 |";
    const blocks = parseMarkdown(src);
    expect(blocks).toEqual([
      {
        type: "table",
        header: ["Account", "Amount"],
        align: ["left", "right"],
        rows: [
          ["Roth", "$500"],
          ["Taxable", "$250"],
        ],
      },
    ]);
  });

  it("treats a bare --- as a horizontal rule, not a table divider", () => {
    expect(parseMarkdown("above\n\n---\n\nbelow")).toEqual([
      { type: "p", text: "above" },
      { type: "hr" },
      { type: "p", text: "below" },
    ]);
  });

  it("parses fenced code blocks verbatim", () => {
    expect(parseMarkdown("```\nsell TSLA\n```")).toEqual([{ type: "code", text: "sell TSLA" }]);
  });

  it("is tolerant of incomplete streaming input (never throws)", () => {
    // A half-written table mid-stream should still parse into something.
    expect(() => parseMarkdown("| Account | Amount |\n| :--")).not.toThrow();
    expect(() => parseMarkdown("**bold without clos")).not.toThrow();
    expect(() => parseMarkdown("```\nunterminated")).not.toThrow();
  });
});
