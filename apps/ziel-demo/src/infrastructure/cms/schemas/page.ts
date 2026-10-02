import { z } from "zod";

import { entryLinkSchema } from "./scalars.js";
import { taxonomyTermLinkSchema } from "./taxonomy-term.js";

export const pagePayloadSchema = z.object({
  id: z.string(),
  title: z.string(),
  menuId: z.string(),
  footerId: z.string(),
  strips: z.array(entryLinkSchema),
  related: z.array(z.string()),
  primaryTerm: taxonomyTermLinkSchema,
  relatedTerms: z.array(taxonomyTermLinkSchema),
});

export type PagePayloadWire = z.infer<typeof pagePayloadSchema>;
