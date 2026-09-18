import type { ContentType } from "../model/content-type";
import {
  emitInferredType,
  localeStarEntrySchemaExportName,
  localeStarFieldsSchemaExportName,
  localizedEntrySchemaExportName,
  localizedFieldsSchemaExportName,
} from "./schema-name";

/** Emit shared Delivery/Preview entry `sys` primitives (after locale enum). */
export function emitEntrySysPrimitives(): string {
  return [
    "export const ContentfulResourceLinkSchema = z.object({",
    "  sys: z.object({",
    '    type: z.literal("Link"),',
    "    linkType: z.string(),",
    "    id: z.string(),",
    "  }),",
    "});",
    "",
    "/** Loose Delivery/Preview entry metadata; extra Contentful fields pass through. */",
    "export const ContentfulEntrySysSchema = z.looseObject({",
    "  id: z.string(),",
    '  type: z.literal("Entry"),',
    "  createdAt: z.string(),",
    "  updatedAt: z.string(),",
    "  revision: z.number(),",
    "  contentType: z.object({",
    "    sys: z.object({",
    '      type: z.literal("Link"),',
    '      linkType: z.literal("ContentType"),',
    "      id: z.string(),",
    "    }),",
    "  }),",
    "  space: ContentfulResourceLinkSchema,",
    "  environment: ContentfulResourceLinkSchema,",
    "  locale: ContentfulLocaleCodeSchema.optional(),",
    "  publishedVersion: z.number().optional(),",
    "});",
    "",
    emitInferredType("ContentfulResourceLinkSchema"),
    emitInferredType("ContentfulEntrySysSchema"),
    "",
    "/** Structural Delivery/Preview entry envelope (any content type); fields are untyped. */",
    "export const ContentfulEntryEnvelopeSchema = z.object({",
    "  sys: ContentfulEntrySysSchema,",
    "  fields: z.record(z.string(), z.unknown()),",
    "});",
    "",
    emitInferredType("ContentfulEntryEnvelopeSchema"),
  ].join("\n");
}

/** Emit Delivery/Preview asset payload schemas (not tied to a content type). */
export function emitAssetDeliverySchema(): string {
  return [
    "/** Loose Delivery/Preview asset metadata; extra Contentful fields pass through. */",
    "export const ContentfulAssetSysSchema = z.looseObject({",
    "  id: z.string(),",
    '  type: z.literal("Asset"),',
    "  createdAt: z.string(),",
    "  updatedAt: z.string(),",
    "  revision: z.number(),",
    "  space: ContentfulResourceLinkSchema,",
    "  environment: ContentfulResourceLinkSchema,",
    "  locale: ContentfulLocaleCodeSchema.optional(),",
    "  publishedVersion: z.number().optional(),",
    "});",
    "",
    emitInferredType("ContentfulAssetSysSchema"),
    "",
    "export const ContentfulAssetFieldsSchema = z.object({",
    "  title: transportField(z.string()),",
    "  file: transportField(",
    "    z.object({",
    "      url: z.string(),",
    "      fileName: z.string().optional(),",
    "      contentType: z.string().optional(),",
    "    })",
    "  ),",
    "});",
    "",
    emitInferredType("ContentfulAssetFieldsSchema"),
    "",
    "/** Resolved Delivery/Preview asset payload. */",
    "export const ContentfulAssetSchema = z.object({",
    "  sys: ContentfulAssetSysSchema,",
    "  fields: ContentfulAssetFieldsSchema,",
    "});",
    "",
    emitInferredType("ContentfulAssetSchema"),
  ].join("\n");
}

function emitContentTypeEntrySchema(
  contentType: ContentType,
  entryName: string,
  fieldsSchema: string
): string[] {
  const contentTypeId = JSON.stringify(contentType.id);

  return [
    `export const ${entryName} = z.object({`,
    "  sys: ContentfulEntrySysSchema.extend({",
    "    contentType: z.object({",
    "      sys: z.object({",
    '        type: z.literal("Link"),',
    '        linkType: z.literal("ContentType"),',
    `        id: z.literal(${contentTypeId}),`,
    "      }),",
    "    }),",
    "  }),",
    `  fields: ${fieldsSchema},`,
    "});",
    "",
    emitInferredType(entryName),
    "",
  ];
}

/** Emit `{ContentType}LocalizedEntrySchema` wrapping typed `sys` and localized-only `fields`. */
export function emitContentTypeLocalizedEntrySchema(contentType: ContentType): string[] {
  return emitContentTypeEntrySchema(
    contentType,
    localizedEntrySchemaExportName(contentType.id),
    localizedFieldsSchemaExportName(contentType.id)
  );
}

/** Emit `{ContentType}LocaleStarEntrySchema` wrapping typed `sys` and `locale=*` `fields`. */
export function emitContentTypeLocaleStarEntrySchema(contentType: ContentType): string[] {
  return emitContentTypeEntrySchema(
    contentType,
    localeStarEntrySchemaExportName(contentType.id),
    localeStarFieldsSchemaExportName(contentType.id)
  );
}
