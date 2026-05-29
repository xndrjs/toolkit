import { z } from "zod";

/** Shared Contentful field-value primitives inlined at the top of generated files. */
export const ContentfulLocationSchema = z.object({
  lat: z.number(),
  lon: z.number(),
});

export const ContentfulEntryLinkSchema = z.object({
  sys: z.object({
    type: z.literal("Link"),
    linkType: z.literal("Entry"),
    id: z.string(),
  }),
});

export const ContentfulAssetLinkSchema = z.object({
  sys: z.object({
    type: z.literal("Link"),
    linkType: z.literal("Asset"),
    id: z.string(),
  }),
});

export const CONTENTFUL_PRIMITIVE_SCHEMA_NAMES = [
  "ContentfulLocationSchema",
  "ContentfulEntryLinkSchema",
  "ContentfulAssetLinkSchema",
] as const;

export type ContentfulPrimitiveSchemaName = (typeof CONTENTFUL_PRIMITIVE_SCHEMA_NAMES)[number];

export const CONTENTFUL_PRIMITIVE_SCHEMAS: Record<ContentfulPrimitiveSchemaName, z.ZodType> = {
  ContentfulLocationSchema,
  ContentfulEntryLinkSchema,
  ContentfulAssetLinkSchema,
};
