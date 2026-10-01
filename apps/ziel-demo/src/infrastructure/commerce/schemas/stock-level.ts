import { z } from "zod";

export const stockLevelPayloadSchema = z.object({
  sku: z.string(),
  available: z.number(),
});

export type StockLevelPayloadWire = z.infer<typeof stockLevelPayloadSchema>;
