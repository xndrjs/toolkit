import { z } from "zod";

export const productMediaPayloadSchema = z.object({
  id: z.string(),
  url: z.string(),
  alt: z.string(),
});

export type ProductMediaPayloadWire = z.infer<typeof productMediaPayloadSchema>;
