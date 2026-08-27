/**
 * Client-side helpers for attaching screenshots, PDFs, and CSV exports to the
 * strategist.
 *
 * Everything the strategist "sees" is turned into an {@link Attachment} here,
 * then sent to /api/strategist as Anthropic content blocks. Three constraints
 * shape this file:
 *   1. Netlify functions cap the request body at ~6 MB, and we re-send the
 *      whole conversation each turn — so images are downscaled and PDFs are
 *      size-capped before they ever leave the browser.
 *   2. The strategist reads numbers off these images (holdings, prices), so
 *      downscaling favours legibility: cap the long edge at Claude's optimal
 *      1568 px and keep small, already-crisp images byte-for-byte.
 *   3. Phones lie about MIME types. iOS and Android hand back "text/csv",
 *      "application/vnd.ms-excel", "application/octet-stream", or an empty
 *      string for the very same CSV, so {@link classifyFile} falls back to the
 *      file extension rather than rejecting a file the owner can plainly see.
 */

/** Media types Anthropic accepts as `image` blocks. */
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
const PDF_TYPE = "application/pdf";
/** Media type Anthropic accepts for a plain-text `document` block. */
const TEXT_TYPE = "text/plain";

/** MIME types phones and desktops report for delimited text files. */
const TEXT_TYPES = ["text/csv", "text/plain", "text/tab-separated-values", "application/csv"] as const;

/** Extension → media type, used when the picker reports "" or octet-stream. */
const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: PDF_TYPE,
  csv: TEXT_TYPE,
  tsv: TEXT_TYPE,
  txt: TEXT_TYPE,
  text: TEXT_TYPE,
};

/**
 * Binary spreadsheets. They share MIME types with CSV on some platforms
 * (.xls is "application/vnd.ms-excel", and so is a CSV on Windows), so they're
 * matched by extension first and refused with a pointer to CSV export.
 */
const SPREADSHEET_EXTENSIONS = ["xlsx", "xls", "xlsm", "xlsb", "ods", "numbers"] as const;

/** Claude downsamples anything past this; matching it avoids wasted bytes. */
const MAX_IMAGE_EDGE = 1568;
/** JPEG quality used only when we must re-encode a large/oversized image. */
const IMAGE_QUALITY = 0.92;
/** Below this, a correctly-sized image is passed through untouched (crisper text). */
const PASSTHROUGH_MAX_BYTES = 900 * 1024;
/** Hard cap on a single PDF's raw size (base64 inflates it ~1.33x). */
const MAX_PDF_BYTES = 3 * 1024 * 1024;
/** Hard cap on a CSV/text file — ~512 KB of CSV is already a very long ledger. */
const MAX_TEXT_BYTES = 512 * 1024;

/** Most attachments allowed on a single turn. */
export const MAX_ATTACHMENTS = 4;
/** Ceiling on the combined decoded size of one turn's attachments (Netlify headroom). */
export const MAX_TOTAL_BYTES = 4.5 * 1024 * 1024;

/** How a file is handed to the model: as pixels, as a PDF, or as raw text. */
export type AttachmentKind = "image" | "pdf" | "text";

export interface Attachment {
  kind: AttachmentKind;
  /** Original file name, shown in the UI. */
  name: string;
  /** e.g. "image/jpeg", "application/pdf", or "text/plain" — the block's media_type. */
  mediaType: string;
  /** Base64 payload (no `data:` prefix) for images and PDFs; raw UTF-8 text for `text`. */
  data: string;
  /** Approximate decoded byte size, for display and the total-size guard. */
  bytes: number;
}

/** Rebuild a `data:` URL for previewing an attachment in an <img>/<embed>/link. */
export function attachmentDataUrl(a: Attachment): string {
  if (a.kind === "text") return `data:${a.mediaType};charset=utf-8,${encodeURIComponent(a.data)}`;
  return `data:${a.mediaType};base64,${a.data}`;
}

/** Approximate decoded byte length of a base64 string (ignoring padding). */
export function b64Bytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

/** Human-friendly size, e.g. "412 KB" or "2.1 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function isImageType(t: string): boolean {
  return (IMAGE_TYPES as readonly string[]).includes(t);
}

/** Lower-cased extension of a file name, or "" when it has none. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * Decide how to treat a picked file, and settle on the media type to send.
 *
 * The extension is consulted whenever the reported MIME type is unhelpful,
 * which on mobile is most of the time: iOS reports "" for a CSV shared out of
 * Files, and Android's picker often reports "application/octet-stream". Returns
 * null for anything we can't hand to the model.
 */
export function classifyFile(
  name: string,
  mediaType: string,
): { kind: AttachmentKind; mediaType: string } | null {
  const ext = extensionOf(name);
  // Checked before the MIME type: a real .xls also claims "application/vnd.ms-excel".
  if ((SPREADSHEET_EXTENSIONS as readonly string[]).includes(ext)) return null;

  const type = mediaType.split(";")[0]!.trim().toLowerCase();
  if (isImageType(type)) return { kind: "image", mediaType: type };
  if (type === PDF_TYPE) return { kind: "pdf", mediaType: PDF_TYPE };
  if ((TEXT_TYPES as readonly string[]).includes(type)) return { kind: "text", mediaType: TEXT_TYPE };

  // MIME type was missing or generic — fall back to the extension.
  const byExt = EXTENSION_TYPES[ext];
  if (!byExt) return null;
  if (byExt === PDF_TYPE) return { kind: "pdf", mediaType: PDF_TYPE };
  if (byExt === TEXT_TYPE) return { kind: "text", mediaType: TEXT_TYPE };
  return { kind: "image", mediaType: byExt };
}

/** True when the file is a binary spreadsheet we ask the owner to export as CSV. */
export function isSpreadsheetFile(name: string): boolean {
  return (SPREADSHEET_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/** Read a File as a `data:` URL (base64) via FileReader. */
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error(`Couldn't read ${file.name}.`));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
}

/** Strip the `data:<type>;base64,` prefix, returning just the payload. */
function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/** Load a data URL into an HTMLImageElement so we can inspect/redraw it. */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't decode that image."));
    img.src = dataUrl;
  });
}

/**
 * Downscale an oversized image to a JPEG within {@link MAX_IMAGE_EDGE}. Returns
 * null when no re-encode is needed (caller keeps the original bytes).
 */
async function downscale(
  dataUrl: string,
): Promise<{ data: string; mediaType: string; bytes: number } | null> {
  const img = await loadImage(dataUrl);
  const { naturalWidth: w, naturalHeight: h } = img;
  if (w <= MAX_IMAGE_EDGE && h <= MAX_IMAGE_EDGE) return null;

  const scale = MAX_IMAGE_EDGE / Math.max(w, h);
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null; // no 2d context → fall back to original bytes
  // White matte so any transparency doesn't turn black under JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);

  const out = canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
  const data = stripDataUrl(out);
  return { data, mediaType: "image/jpeg", bytes: b64Bytes(data) };
}

/** Read, size-check, and downscale an image file into an {@link Attachment}. */
async function imageAttachment(file: File, mediaType: string): Promise<Attachment> {
  const dataUrl = await readDataUrl(file);
  // When the media type came from the file name, prefer what the browser itself
  // put in the data URL — an extension can lie, and a mismatched media_type is
  // a 400 from the API.
  const sniffed = dataUrl.slice(5, dataUrl.indexOf(";"));
  const resolved = isImageType(sniffed) ? sniffed : mediaType;
  // Small, in-spec images: keep original bytes for the crispest text.
  if (file.size <= PASSTHROUGH_MAX_BYTES) {
    const reduced = await downscale(dataUrl); // still shrink if dimensions are huge
    if (!reduced) {
      const data = stripDataUrl(dataUrl);
      return { kind: "image", name: file.name, mediaType: resolved, data, bytes: b64Bytes(data) };
    }
    return { kind: "image", name: file.name, ...reduced };
  }
  // Larger images: prefer a downscaled JPEG; if already small enough in
  // dimensions, re-encode to JPEG anyway to shed weight.
  const reduced = await downscale(dataUrl);
  if (reduced) return { kind: "image", name: file.name, ...reduced };
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const data = stripDataUrl(dataUrl);
    return { kind: "image", name: file.name, mediaType: resolved, data, bytes: b64Bytes(data) };
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  const data = stripDataUrl(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
  return { kind: "image", name: file.name, mediaType: "image/jpeg", data, bytes: b64Bytes(data) };
}

/**
 * Convert a picked/pasted/dropped File into an {@link Attachment}, downscaling
 * large images and rejecting unsupported or oversized files with a clear error.
 */
export async function fileToAttachment(file: File): Promise<Attachment> {
  const kind = classifyFile(file.name, file.type);

  if (!kind) {
    if (isSpreadsheetFile(file.name)) {
      throw new Error(
        `${file.name} is a spreadsheet — export it as CSV from Excel, Numbers, or your broker, then attach that.`,
      );
    }
    throw new Error(
      `${file.name || "That file"} isn't a supported type — attach a CSV, PNG, JPEG, WebP, GIF, or PDF.`,
    );
  }

  if (kind.kind === "image") return imageAttachment(file, kind.mediaType);

  if (kind.kind === "pdf") {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(`${file.name} is ${formatBytes(file.size)} — PDFs must be under ${formatBytes(MAX_PDF_BYTES)}.`);
    }
    const data = stripDataUrl(await readDataUrl(file));
    return { kind: "pdf", name: file.name, mediaType: PDF_TYPE, data, bytes: b64Bytes(data) };
  }

  // CSV / plain text: sent verbatim as a text document block, so the strategist
  // reads exact figures instead of squinting at a screenshot of them.
  if (file.size > MAX_TEXT_BYTES) {
    throw new Error(
      `${file.name} is ${formatBytes(file.size)} — CSV and text files must be under ${formatBytes(MAX_TEXT_BYTES)}.`,
    );
  }
  const text = await file.text();
  if (!text.trim()) throw new Error(`${file.name} looks empty.`);
  return { kind: "text", name: file.name, mediaType: TEXT_TYPE, data: text, bytes: file.size };
}

/** An attachment as an Anthropic content block, ready to POST to our API routes. */
export type AttachmentBlock =
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "text"; media_type: string; data: string }; title: string };

/**
 * Turn an attachment into the content block the model receives. Images and PDFs
 * travel as base64; CSV/text travels as a plain-text document block, which is
 * both cheaper and exact — the model reads the characters, not pixels.
 */
export function attachmentBlock(a: Attachment): AttachmentBlock {
  if (a.kind === "image") {
    return { type: "image", source: { type: "base64", media_type: a.mediaType, data: a.data } };
  }
  if (a.kind === "pdf") {
    return { type: "document", source: { type: "base64", media_type: a.mediaType, data: a.data } };
  }
  return {
    type: "document",
    source: { type: "text", media_type: TEXT_TYPE, data: a.data },
    // The file name is the only hint of which account an export came from.
    title: a.name,
  };
}
