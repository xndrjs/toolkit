import { z } from "zod";

import type { ContentType } from "../model/content-type";
import { entrySchemaExportName, entryTypeName } from "./schema-name";
import { zodToSource } from "./zod-to-source";

function buildContentTypeIdSchema(
  contentTypeIds: readonly string[]
): z.ZodEnum<Readonly<Record<string, string>>> {
  if (contentTypeIds.length === 0) {
    throw new Error(
      "At least one content type is required to build ContentfulContentTypeIdSchema."
    );
  }

  const [first, ...rest] = contentTypeIds as [string, ...string[]];
  return z.enum([first, ...rest]);
}

/**
 * Emit content-type id enum/constants (always useful) and, when Entry schemas exist,
 * typed entry maps keyed by content type id.
 */
export function emitContentTypeIdPrimitives(
  contentTypes: readonly ContentType[],
  options: { includeEntryMaps: boolean }
): string {
  const ids = contentTypes.map((contentType) => contentType.id);
  const schemaSource = zodToSource(buildContentTypeIdSchema(ids));

  const lines: string[] = [
    "/** @generated from content type snapshot */",
    `export const ContentfulContentTypeIdSchema = ${schemaSource};`,
    "export type ContentfulContentTypeId = z.infer<typeof ContentfulContentTypeIdSchema>;",
    "",
    "export const CONTENTFUL_CONTENT_TYPE_IDS = ContentfulContentTypeIdSchema.options;",
  ];

  if (!options.includeEntryMaps) {
    return lines.join("\n");
  }

  const entryByTypeEntries = contentTypes.map((contentType) => {
    const id = JSON.stringify(contentType.id);
    return `  ${id}: ${entryTypeName(contentType.id)};`;
  });

  const schemaByTypeEntries = contentTypes.map((contentType) => {
    const id = JSON.stringify(contentType.id);
    return `  ${id}: ${entrySchemaExportName(contentType.id)},`;
  });

  lines.push(
    "",
    "/** Resolved Delivery/Preview entry type per content type id. */",
    "export type ContentfulEntryByContentType = {",
    ...entryByTypeEntries,
    "};",
    "",
    "/** Zod entry schema per content type id (for typed parse + dispatch). */",
    "export const ContentfulEntrySchemaByContentType = {",
    ...schemaByTypeEntries,
    "} as const satisfies {",
    "  [K in ContentfulContentTypeId]: z.ZodType<ContentfulEntryByContentType[K]>;",
    "};"
  );

  return lines.join("\n");
}
