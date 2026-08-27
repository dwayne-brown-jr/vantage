import { z } from "zod";

/**
 * Zod schemas for the Anthropic content blocks our API routes accept from the
 * browser. They live here, rather than in either route, because the strategist
 * and the reconciler must accept exactly the same attachments — a CSV the chat
 * accepts but the reconciler rejects is a bug the owner only finds mid-flow.
 *
 * These are the server-side mirror of `attachmentBlock()` in lib/attachments.ts;
 * tests/attachments.test.ts parses one against the other to keep them in step.
 */

export const textBlock = z.object({ type: z.literal("text"), text: z.string().min(1).max(8000) });

/** Screenshots. Base64 payloads are large, so the cap is generous but bounded. */
export const imageBlock = z.object({
  type: z.literal("image"),
  source: z.object({
    type: z.literal("base64"),
    media_type: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
    data: z.string().min(1).max(7_500_000),
  }),
});

// A statement travels as a base64 PDF; a CSV export travels as plain text —
// exact characters instead of pixels, and a fraction of the tokens.
export const documentBlock = z.object({
  type: z.literal("document"),
  source: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("base64"),
      media_type: z.literal("application/pdf"),
      data: z.string().min(1).max(9_000_000),
    }),
    z.object({
      type: z.literal("text"),
      media_type: z.literal("text/plain"),
      data: z.string().min(1).max(600_000),
    }),
  ]),
  /** File name, so the model can tell one account's export from another's. */
  title: z.string().min(1).max(200).optional(),
});

/** Anything the owner can attach to a turn. */
export const attachmentBlockSchema = z.discriminatedUnion("type", [imageBlock, documentBlock]);

/** A whole turn's content: attachments plus the question. */
export const contentBlock = z.discriminatedUnion("type", [textBlock, imageBlock, documentBlock]);
