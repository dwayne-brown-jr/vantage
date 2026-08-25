/**
 * Client-side helpers for attaching screenshots and PDFs to the strategist.
 *
 * Everything the strategist "sees" is turned into an {@link Attachment} here,
 * then sent to /api/strategist as Anthropic content blocks. Two constraints
 * shape this file:
 *   1. Netlify functions cap the request body at ~6 MB, and we re-send the
 *      whole conversation each turn — so images are downscaled and PDFs are
 *      size-capped before they ever leave the browser.
 *   2. The strategist reads numbers off these images (holdings, prices), so
 *      downscaling favours legibility: cap the long edge at Claude's optimal
 *      1568 px and keep small, already-crisp images byte-for-byte.
 */

/** Media types Anthropic accepts as `image` blocks. */
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
const PDF_TYPE = "application/pdf";

/** Claude downsamples anything past this; matching it avoids wasted bytes. */
const MAX_IMAGE_EDGE = 1568;
/** JPEG quality used only when we must re-encode a large/oversized image. */
const IMAGE_QUALITY = 0.92;
/** Below this, a correctly-sized image is passed through untouched (crisper text). */
const PASSTHROUGH_MAX_BYTES = 900 * 1024;
/** Hard cap on a single PDF's raw size (base64 inflates it ~1.33x). */
const MAX_PDF_BYTES = 3 * 1024 * 1024;

/** Most attachments allowed on a single turn. */
export const MAX_ATTACHMENTS = 4;
/** Ceiling on the combined decoded size of one turn's attachments (Netlify headroom). */
export const MAX_TOTAL_BYTES = 4.5 * 1024 * 1024;

export interface Attachment {
  kind: "image" | "pdf";
  /** Original file name, shown in the UI. */
  name: string;
  /** e.g. "image/jpeg" or "application/pdf" — the block's media_type. */
  mediaType: string;
  /** Base64 payload with no `data:` prefix. */
  data: string;
  /** Approximate decoded byte size, for display and the total-size guard. */
  bytes: number;
}

/** Rebuild a `data:` URL for previewing an attachment in an <img>/<embed>. */
export function attachmentDataUrl(a: Attachment): string {
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

/**
 * Convert a picked/pasted/dropped File into an {@link Attachment}, downscaling
 * large images and rejecting unsupported or oversized files with a clear error.
 */
export async function fileToAttachment(file: File): Promise<Attachment> {
  if (isImageType(file.type)) {
    const dataUrl = await readDataUrl(file);
    // Small, in-spec images: keep original bytes for the crispest text.
    if (file.size <= PASSTHROUGH_MAX_BYTES) {
      const reduced = await downscale(dataUrl); // still shrink if dimensions are huge
      if (!reduced) {
        const data = stripDataUrl(dataUrl);
        return { kind: "image", name: file.name, mediaType: file.type, data, bytes: b64Bytes(data) };
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
      return { kind: "image", name: file.name, mediaType: file.type, data, bytes: b64Bytes(data) };
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const data = stripDataUrl(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
    return { kind: "image", name: file.name, mediaType: "image/jpeg", data, bytes: b64Bytes(data) };
  }

  if (file.type === PDF_TYPE) {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(`${file.name} is ${formatBytes(file.size)} — PDFs must be under ${formatBytes(MAX_PDF_BYTES)}.`);
    }
    const data = stripDataUrl(await readDataUrl(file));
    return { kind: "pdf", name: file.name, mediaType: PDF_TYPE, data, bytes: b64Bytes(data) };
  }

  throw new Error(`${file.name || "That file"} isn't a supported type — attach a PNG, JPEG, WebP, GIF, or PDF.`);
}
