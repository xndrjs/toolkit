import { z } from "zod";

/**
 * Wire shape for an external media descriptor (CDN metadata).
 * Validated at the loader boundary; composition root unwraps without re-parsing.
 */
export const mediaDescriptorWireSchema = z.object({
  provider: z.literal("cdn"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  focalPoint: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
});

export type MediaDescriptorWire = z.infer<typeof mediaDescriptorWireSchema>;
