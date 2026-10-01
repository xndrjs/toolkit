import { z } from "zod";

export const customReferencePayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("Entry"),
    spaceId: z.string(),
    environmentId: z.string(),
    id: z.string(),
  }),
  z.object({
    kind: z.literal("Asset"),
    spaceId: z.string(),
    environmentId: z.string(),
    id: z.string(),
  }),
]);

export type CustomReferencePayloadWire = z.infer<typeof customReferencePayloadSchema>;
