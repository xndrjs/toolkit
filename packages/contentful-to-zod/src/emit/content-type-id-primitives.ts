import type { ContentType } from "../model/content-type";
import {
  emitInferredType,
  localeStarEntrySchemaExportName,
  localeStarEntryTypeName,
  localizedEntrySchemaExportName,
  localizedEntryTypeName,
} from "./schema-name";

function serializeConstStringArray(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function emitEntryMapBlock(
  contentTypes: readonly ContentType[],
  options: {
    typeName: string;
    schemaConstName: string;
    resolvedSchemaName: string;
    typeDoc: string;
    schemaDoc: string;
    resolvedDoc: string;
    entryTypeName: (contentTypeId: string) => string;
    entrySchemaName: (contentTypeId: string) => string;
  }
): string[] {
  const entrySchemaNames = contentTypes.map((contentType) =>
    options.entrySchemaName(contentType.id)
  );

  const entryByTypeEntries = contentTypes.map((contentType) => {
    const id = JSON.stringify(contentType.id);
    return `  ${id}: ${options.entryTypeName(contentType.id)};`;
  });

  const schemaByTypeEntries = contentTypes.map((contentType) => {
    const id = JSON.stringify(contentType.id);
    return `  ${id}: ${options.entrySchemaName(contentType.id)},`;
  });

  const lines: string[] = [
    "",
    `/** ${options.typeDoc} */`,
    `export type ${options.typeName} = {`,
    ...entryByTypeEntries,
    "};",
    "",
    `/** ${options.schemaDoc} */`,
    `export const ${options.schemaConstName} = {`,
    ...schemaByTypeEntries,
    "} as const satisfies {",
    `  [K in ContentfulContentTypeId]: z.ZodType<${options.typeName}[K]>;`,
    "};",
  ];

  if (entrySchemaNames.length === 1) {
    lines.push(
      "",
      `/** ${options.resolvedDoc} */`,
      `export const ${options.resolvedSchemaName} = ${entrySchemaNames[0]};`,
      emitInferredType(options.resolvedSchemaName)
    );
  } else if (entrySchemaNames.length > 1) {
    lines.push(
      "",
      `/** ${options.resolvedDoc} */`,
      `export const ${options.resolvedSchemaName} = z.union([${entrySchemaNames.join(", ")}]);`,
      emitInferredType(options.resolvedSchemaName)
    );
  }

  return lines;
}

/**
 * Emit content-type id enum/constants (always useful) and, when entry schemas exist,
 * typed entry maps keyed by content type id.
 */
export function emitContentTypeIdPrimitives(
  contentTypes: readonly ContentType[],
  options: {
    includeEntryMaps?: boolean;
    includeLocaleStarEntryMaps?: boolean;
  }
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

  if (options.includeEntryMaps) {
    lines.push(
      ...emitEntryMapBlock(contentTypes, {
        typeName: "ContentfulLocalizedEntryByContentType",
        schemaConstName: "ContentfulLocalizedEntrySchemaByContentType",
        resolvedSchemaName: "ContentfulResolvedLocalizedEntrySchema",
        typeDoc: "Localized-only entry type per content type id.",
        schemaDoc: "Zod localized entry schema per content type id (for typed parse + dispatch).",
        resolvedDoc: "Localized-only entry (any content type in this snapshot).",
        entryTypeName: localizedEntryTypeName,
        entrySchemaName: localizedEntrySchemaExportName,
      })
    );
  }

  if (options.includeLocaleStarEntryMaps) {
    lines.push(
      ...emitEntryMapBlock(contentTypes, {
        typeName: "ContentfulLocaleStarEntryByContentType",
        schemaConstName: "ContentfulLocaleStarEntrySchemaByContentType",
        resolvedSchemaName: "ContentfulResolvedLocaleStarEntrySchema",
        typeDoc: "Locale-star (`locale=*`) entry type per content type id.",
        schemaDoc: "Zod locale-star entry schema per content type id (for typed parse + dispatch).",
        resolvedDoc: "Locale-star entry (any content type in this snapshot).",
        entryTypeName: localeStarEntryTypeName,
        entrySchemaName: localeStarEntrySchemaExportName,
      })
    );
  }

  return lines.join("\n");
}
