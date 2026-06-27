/**
 * A small, dependency-free markdown block parser — just the subset the
 * strategist emits: headings, paragraphs, bullet/ordered lists, GFM pipe
 * tables, horizontal rules, and fenced code. Pure and tolerant of incomplete
 * input (it runs on every streaming token), so it never throws on half-written
 * markdown. Inline formatting (**bold**, `code`, *italic*, links) is applied at
 * render time, not here.
 */

export type MdAlign = "left" | "right" | "center";

export type MdBlock =
  | { type: "h"; level: 1 | 2 | 3; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; header: string[]; align: MdAlign[]; rows: string[][] }
  | { type: "hr" }
  | { type: "code"; text: string };

const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** A GFM table divider row, e.g. `| --- | :--: | --: |`. */
const isDivider = (line: string): boolean =>
  line.includes("-") && /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line);

const isHeading = (line: string): boolean => /^#{1,3}\s+/.test(line);
const isUl = (line: string): boolean => /^\s*[-*]\s+/.test(line);
const isOl = (line: string): boolean => /^\s*\d+\.\s+/.test(line);
const isHr = (line: string): boolean => /^\s*([-*_])\1{2,}\s*$/.test(line);
const isFence = (line: string): boolean => /^```/.test(line.trim());
const startsTable = (lines: string[], i: number): boolean =>
  (lines[i] ?? "").includes("|") && i + 1 < lines.length && isDivider(lines[i + 1] ?? "");

export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  /** Safe accessor — every read is bounds-guarded by the loop conditions. */
  const at = (n: number): string => lines[n] ?? "";
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = at(i);

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block.
    if (isFence(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !isFence(at(i))) {
        buf.push(at(i));
        i++;
      }
      i++; // closing fence (or EOF)
      blocks.push({ type: "code", text: buf.join("\n") });
      continue;
    }

    // Horizontal rule (checked before tables so a bare `---` isn't a divider).
    if (isHr(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Heading.
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ type: "h", level: (h[1] ?? "#").length as 1 | 2 | 3, text: (h[2] ?? "").trim() });
      i++;
      continue;
    }

    // GFM pipe table.
    if (startsTable(lines, i)) {
      const header = splitRow(line);
      const align: MdAlign[] = splitRow(at(i + 1)).map((c) => {
        const l = c.startsWith(":");
        const r = c.endsWith(":");
        return l && r ? "center" : r ? "right" : "left";
      });
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && at(i).includes("|") && at(i).trim() !== "") {
        rows.push(splitRow(at(i)));
        i++;
      }
      blocks.push({ type: "table", header, align, rows });
      continue;
    }

    // Unordered list.
    if (isUl(line)) {
      const items: string[] = [];
      while (i < lines.length && isUl(at(i))) {
        items.push(at(i).replace(/^\s*[-*]\s+/, "").trim());
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Ordered list.
    if (isOl(line)) {
      const items: string[] = [];
      while (i < lines.length && isOl(at(i))) {
        items.push(at(i).replace(/^\s*\d+\.\s+/, "").trim());
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Paragraph: gather consecutive lines until a blank line or a new block.
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      at(i).trim() !== "" &&
      !isHeading(at(i)) &&
      !isUl(at(i)) &&
      !isOl(at(i)) &&
      !isFence(at(i)) &&
      !isHr(at(i)) &&
      !startsTable(lines, i)
    ) {
      buf.push(at(i));
      i++;
    }
    blocks.push({ type: "p", text: buf.join("\n") });
  }

  return blocks;
}
