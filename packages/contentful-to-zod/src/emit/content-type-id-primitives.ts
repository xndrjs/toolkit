import type { ContentType } from "../model/content-type";
import { emitInferredType, entrySchemaExportName, entryTypeName } from "./schema-name";

function serializeConstStringArray(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
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
  if (ids.length === 0) {
    throw new Error(
      "At least one content type is required to build ContentfulContentTypeIdSchema."
    );
  }

  const lines: string[] = [
    "/** @generated from content type snapshot */",
    `export const CONTENTFUL_CONTENT_TYPE_IDS = ${serializeConstStringArray(ids)} as const;`,
    "export type ContentfulContentTypeId = (typeof CONTENTFUL_CONTENT_TYPE_IDS)[number];",
    "export const ContentfulContentTypeIdSchema = z.enum(CONTENTFUL_CONTENT_TYPE_IDS);",
  ];

  if (!options.includeEntryMaps) {
    return lines.join("\n");
  }

  const entrySchemaNames = contentTypes.map((contentType) => entrySchemaExportName(contentType.id));

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

  if (entrySchemaNames.length === 1) {
    lines.push(
      "",
      "/** Resolved Delivery/Preview entry (any content type in this snapshot). */",
      `export const ContentfulResolvedEntrySchema = ${entrySchemaNames[0]};`,
      emitInferredType("ContentfulResolvedEntrySchema")
    );
  } else if (entrySchemaNames.length > 1) {
    lines.push(
      "",
      "/** Resolved Delivery/Preview entry (any content type in this snapshot). */",
      `export const ContentfulResolvedEntrySchema = z.union([${entrySchemaNames.join(", ")}]);`,
      emitInferredType("ContentfulResolvedEntrySchema")
    );
  }

  return lines.join("\n");
}
