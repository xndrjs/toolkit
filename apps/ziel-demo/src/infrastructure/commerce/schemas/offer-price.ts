import { z } from "zod";

export const offerPricePayloadSchema = z.object({
  id: z.string(),
  amountCents: z.number(),
  currency: z.string(),
});

export type OfferPricePayloadWire = z.infer<typeof offerPricePayloadSchema>;
