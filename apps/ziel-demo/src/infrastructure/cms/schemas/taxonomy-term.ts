import { z } from "zod";

/** Composite-key taxonomy link at the wire boundary (plain strings). */
export const taxonomyTermLinkSchema = z.object({
  kind: z.string(),
  id: z.string(),
});

export const taxonomyTermPayloadSchema = z.object({
  kind: z.string(),
  id: z.string(),
  label: z.string(),
  slug: z.string(),
});

export type TaxonomyTermLinkWire = z.infer<typeof taxonomyTermLinkSchema>;
export type TaxonomyTermPayloadWire = z.infer<typeof taxonomyTermPayloadSchema>;
