import { z } from "zod";

export const catalogProductPayloadSchema = z.object({
  id: z.string(),
  title: z.string(),
  priceId: z.string(),
  sku: z.string(),
  mediaId: z.string(),
});

export type CatalogProductPayloadWire = z.infer<typeof catalogProductPayloadSchema>;
