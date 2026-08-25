import { describe, expect, it } from "vitest";

import { attachmentDataUrl, b64Bytes, formatBytes, type Attachment } from "@/lib/attachments";

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
