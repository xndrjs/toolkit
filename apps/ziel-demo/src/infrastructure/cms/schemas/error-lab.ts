import { z } from "zod";

import { entryLinkSchema } from "./scalars.js";

export const errorLabPayloadSchema = z.object({
  id: z.string(),
  title: z.string(),
  softSingleId: z.string(),
  errorSingleId: z.string(),
  throwSingleId: z.string(),
  softItems: z.array(entryLinkSchema),
  errorItems: z.array(entryLinkSchema),
  throwItems: z.array(entryLinkSchema),
});

export type ErrorLabPayloadWire = z.infer<typeof errorLabPayloadSchema>;
