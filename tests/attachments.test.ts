import { describe, expect, it } from "vitest";

import {
  attachmentBlock,
  attachmentDataUrl,
  b64Bytes,
  classifyFile,
  fileToAttachment,
  formatBytes,
  type Attachment,
} from "@/lib/attachments";
import { attachmentBlockSchema, contentBlock } from "@/lib/blocks";

describe("b64Bytes()", () => {
  it("approximates the decoded size of a base64 string (~3/4 of its length)", () => {
    // "AAAA" (4 base64 chars) decodes to 3 bytes.
    expect(b64Bytes("AAAA")).toBe(3);
    expect(b64Bytes("AAAAAAAA")).toBe(6);
    expect(b64Bytes("")).toBe(0);
  });
});

describe("formatBytes()", () => {
  it("shows bytes, KB, and MB at the right thresholds", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(Math.round(2.5 * 1024 * 1024))).toBe("2.5 MB");
  });
});

describe("attachmentDataUrl()", () => {
  it("reconstructs a data: URL from an attachment's media type and payload", () => {
    const att: Attachment = { kind: "image", name: "shot.png", mediaType: "image/png", data: "Zm9v", bytes: 3 };
    expect(attachmentDataUrl(att)).toBe("data:image/png;base64,Zm9v");
  });
});

describe("classifyFile()", () => {
  it("accepts a CSV by MIME type", () => {
    expect(classifyFile("positions.csv", "text/csv")).toEqual({ kind: "text", mediaType: "text/plain" });
  });

  it("accepts a CSV a mobile picker reports no MIME type for", () => {
    // iOS hands back "" for a CSV shared out of Files — the extension decides.
    expect(classifyFile("Portfolio_Positions.csv", "")).toEqual({ kind: "text", mediaType: "text/plain" });
    expect(classifyFile("positions.CSV", "application/octet-stream")).toEqual({
      kind: "text",
      mediaType: "text/plain",
    });
  });

  it("accepts a CSV Windows labels as an Excel file", () => {
    expect(classifyFile("positions.csv", "application/vnd.ms-excel")).toEqual({
      kind: "text",
      mediaType: "text/plain",
    });
  });

  it("still refuses a real binary spreadsheet, whatever its MIME type", () => {
    expect(classifyFile("book.xlsx", "application/vnd.ms-excel")).toBeNull();
    expect(classifyFile("book.xls", "text/csv")).toBeNull();
    expect(classifyFile("book.numbers", "")).toBeNull();
  });

  it("tolerates a charset parameter and odd casing on the MIME type", () => {
    expect(classifyFile("export.tsv", "text/csv; charset=utf-8")).toEqual({ kind: "text", mediaType: "text/plain" });
    expect(classifyFile("shot.png", "IMAGE/PNG")).toEqual({ kind: "image", mediaType: "image/png" });
  });

  it("falls back to the extension for images and PDFs too", () => {
    expect(classifyFile("shot.JPG", "")).toEqual({ kind: "image", mediaType: "image/jpeg" });
    expect(classifyFile("statement.pdf", "application/octet-stream")).toEqual({
      kind: "pdf",
      mediaType: "application/pdf",
    });
  });

  it("rejects types the model can't read", () => {
    expect(classifyFile("archive.zip", "application/zip")).toBeNull();
    expect(classifyFile("noextension", "")).toBeNull();
  });
});

describe("attachmentBlock()", () => {
  it("sends CSV as a plain-text document block titled with the file name", () => {
    const csv: Attachment = {
      kind: "text",
      name: "positions.csv",
      mediaType: "text/plain",
      data: "Symbol,Value\nVTI,1000\n",
      bytes: 23,
    };
    expect(attachmentBlock(csv)).toEqual({
      type: "document",
      source: { type: "text", media_type: "text/plain", data: "Symbol,Value\nVTI,1000\n" },
      title: "positions.csv",
    });
  });

  it("sends images and PDFs as base64 blocks", () => {
    const png: Attachment = { kind: "image", name: "s.png", mediaType: "image/png", data: "Zm9v", bytes: 3 };
    expect(attachmentBlock(png)).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "Zm9v" },
    });

    const pdf: Attachment = { kind: "pdf", name: "s.pdf", mediaType: "application/pdf", data: "Zm9v", bytes: 3 };
    expect(attachmentBlock(pdf)).toEqual({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: "Zm9v" },
    });
  });
});

describe("attachmentDataUrl() for text attachments", () => {
  it("builds a percent-encoded text data URL, not a base64 one", () => {
    const csv: Attachment = {
      kind: "text",
      name: "positions.csv",
      mediaType: "text/plain",
      data: "Symbol,Value\nVTI,1000\n",
      bytes: 23,
    };
    expect(attachmentDataUrl(csv)).toBe("data:text/plain;charset=utf-8,Symbol%2CValue%0AVTI%2C1000%0A");
  });
});

describe("the client's blocks against the API routes' schemas", () => {
  const attachments: Attachment[] = [
    { kind: "text", name: "positions.csv", mediaType: "text/plain", data: "Symbol,Value\nVTI,1000\n", bytes: 23 },
    { kind: "image", name: "s.png", mediaType: "image/png", data: "Zm9v", bytes: 3 },
    { kind: "pdf", name: "s.pdf", mediaType: "application/pdf", data: "Zm9v", bytes: 3 },
  ];

  it("accepts every attachment the browser can produce", () => {
    // Guards the mobile CSV path end to end: a block the picker allows but the
    // route rejects would fail only in production, as a bare 400.
    for (const att of attachments) {
      expect(attachmentBlockSchema.safeParse(attachmentBlock(att)).success).toBe(true);
      expect(contentBlock.safeParse(attachmentBlock(att)).success).toBe(true);
    }
  });

  it("rejects a text document that claims a media type Anthropic won't take", () => {
    const bad = { type: "document", source: { type: "text", media_type: "text/csv", data: "a,b" } };
    expect(attachmentBlockSchema.safeParse(bad).success).toBe(false);
  });
});

describe("fileToAttachment() on a CSV", () => {
  // The mobile case end to end: a picked CSV with no MIME type at all.
  it("reads a CSV the picker gave no MIME type into a text attachment", async () => {
    const csv = "Symbol,Description,Value\nVTI,Vanguard Total Stock,$12,004.11\n";
    const att = await fileToAttachment(new File([csv], "Portfolio_Positions.csv", { type: "" }));
    expect(att).toEqual({
      kind: "text",
      name: "Portfolio_Positions.csv",
      mediaType: "text/plain",
      data: csv,
      bytes: new Blob([csv]).size,
    });
  });

  it("refuses an empty CSV and an oversized one, by name", async () => {
    await expect(fileToAttachment(new File(["  \n"], "empty.csv", { type: "text/csv" }))).rejects.toThrow(
      /empty\.csv looks empty/,
    );
    const huge = "x".repeat(600 * 1024);
    await expect(fileToAttachment(new File([huge], "huge.csv", { type: "text/csv" }))).rejects.toThrow(
      /huge\.csv is 600 KB/,
    );
  });

  it("points an .xlsx at CSV export instead of failing vaguely", async () => {
    await expect(fileToAttachment(new File(["PK"], "book.xlsx", { type: "" }))).rejects.toThrow(
      /export it as CSV/,
    );
  });
});
