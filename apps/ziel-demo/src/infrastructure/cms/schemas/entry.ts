import { z } from "zod";

import { entryLinkSchema } from "./scalars.js";

export const entryPayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("Hero"),
    id: z.string(),
    title: z.string(),
    imageId: z.string(),
  }),
  z.object({
    kind: z.literal("Tabs"),
    id: z.string(),
    title: z.string(),
    tabs: z.array(entryLinkSchema),
  }),
  z.object({
    kind: z.literal("Tab"),
    id: z.string(),
    title: z.string(),
    strips: z.array(entryLinkSchema),
  }),
  z.object({
    kind: z.literal("Product"),
    id: z.string(),
    sku: z.string(),
    title: z.string(),
  }),
  z.object({
    kind: z.literal("Menu"),
    id: z.string(),
    title: z.string(),
    logoId: z.string(),
  }),
  z.object({
    kind: z.literal("Footer"),
    id: z.string(),
    cta: z.string(),
    title: z.string(),
    logoId: z.string(),
  }),
  z.object({
    kind: z.literal("Page"),
    id: z.string(),
    title: z.string(),
  }),
  z.object({
    kind: z.literal("SiteInternalLink"),
    id: z.string(),
    targetId: z.string(),
  }),
]);

export type EntryPayloadWire = z.infer<typeof entryPayloadSchema>;
