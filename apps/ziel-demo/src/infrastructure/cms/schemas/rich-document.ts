import { z } from "zod";

/**
 * Wire shape for the external rich-document payload.
 * Ziel treats `RichDocument` as opaque; this schema lives only at the loader
 * / composition-root boundary (not in the DSL).
 */
export const richDocumentWireSchema = z.object({
  version: z.literal(1),
  blocks: z.array(
    z.object({
      type: z.literal("paragraph"),
      text: z.string(),
    })
  ),
});

export type RichDocumentWire = z.infer<typeof richDocumentWireSchema>;
