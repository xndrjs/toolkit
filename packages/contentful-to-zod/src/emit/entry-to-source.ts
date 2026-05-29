import type { ContentType } from "../model/content-type";
import {
  deliveryFieldsSchemaExportName,
  entrySchemaExportName,
  entryTypeName,
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
  ].join("\n");
}

/** Emit `{ContentType}EntrySchema` wrapping typed `sys` and delivery `fields`. */
export function emitContentTypeEntrySchema(contentType: ContentType): string[] {
  const entryName = entrySchemaExportName(contentType.id);
  const typeName = entryTypeName(contentType.id);
  const fieldsSchema = deliveryFieldsSchemaExportName(contentType.id);
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
    `export type ${typeName} = z.infer<typeof ${entryName}>;`,
    "",
  ];
}
