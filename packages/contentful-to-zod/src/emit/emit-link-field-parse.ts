import type { LinkFieldTarget } from "./link-fields";
import { entrySchemaExportName, entryTypeName } from "./schema-name";

function groupLinkFieldTargetsByParent(targets: LinkFieldTarget[]): Map<string, LinkFieldTarget[]> {
  const byParent = new Map<string, LinkFieldTarget[]>();
  for (const target of targets) {
    const list = byParent.get(target.parentContentTypeId) ?? [];
    list.push(target);
    byParent.set(target.parentContentTypeId, list);
  }
  return byParent;
}

function entryTypeUnionForTargets(targetContentTypeIds: readonly string[]): string {
  const entryTypes = targetContentTypeIds.map((id) => entryTypeName(id));
  return entryTypes.length === 1 ? entryTypes[0]! : entryTypes.join(" | ");
}

function emitResolvedEntryForLinkFieldMapType(targets: LinkFieldTarget[]): string {
  const parentLines: string[] = [];
  for (const [parentId, fields] of groupLinkFieldTargetsByParent(targets)) {
    const fieldEntries = fields.map((field) => {
      const valueType = entryTypeUnionForTargets(field.targetContentTypeIds);
      return `    ${JSON.stringify(field.fieldId)}: ${valueType};`;
    });

    parentLines.push(`  ${JSON.stringify(parentId)}: {`, ...fieldEntries, "  };");
  }

  return ["export interface ResolvedEntryForLinkFieldMap {", ...parentLines, "}"].join("\n");
}

function emitLinkFieldHandlersMapType(targets: LinkFieldTarget[]): string {
  const parentLines: string[] = [];
  for (const [parentId, fields] of groupLinkFieldTargetsByParent(targets)) {
    const fieldEntries = fields.map((field) => {
      const returnType = entryTypeUnionForTargets(field.targetContentTypeIds);
      return `    ${JSON.stringify(field.fieldId)}: (entry: unknown) => ${returnType};`;
    });

    parentLines.push(`  ${JSON.stringify(parentId)}: {`, ...fieldEntries, "  };");
  }

  return ["export interface LinkFieldHandlersMap {", ...parentLines, "}"].join("\n");
}

function emitHandlerSwitchCases(targetContentTypeIds: readonly string[]): string[] {
  const lines: string[] = [];
  for (const id of targetContentTypeIds) {
    lines.push(`    case ${JSON.stringify(id)}:`);
    lines.push(`      return ${entrySchemaExportName(id)}.parse(entry);`);
  }
  lines.push("    default:");
  lines.push(
    `      throw new LinkFieldTargetError(parentContentTypeId, fieldId, resolvedId, allowed);`
  );
  return lines;
}

function emitLinkFieldAllowedContentTypesMapType(targets: LinkFieldTarget[]): string {
  const parentLines: string[] = [];
  for (const [parentId, fields] of groupLinkFieldTargetsByParent(targets)) {
    const fieldEntries = fields.map((field) => {
      const tupleMembers = field.targetContentTypeIds.map((id) => JSON.stringify(id)).join(", ");
      return `    ${JSON.stringify(field.fieldId)}: readonly [${tupleMembers}];`;
    });

    parentLines.push(`  ${JSON.stringify(parentId)}: {`, ...fieldEntries, "  };");
  }

  return ["export interface LinkFieldAllowedContentTypesMap {", ...parentLines, "}"].join("\n");
}

function emitLinkFieldAllowedContentTypes(targets: LinkFieldTarget[]): string {
  const parentEntries: string[] = [];
  for (const [parentId, fields] of groupLinkFieldTargetsByParent(targets)) {
    const fieldEntries = fields.map((field) => {
      const allowed = `[${field.targetContentTypeIds.map((id) => JSON.stringify(id)).join(", ")}] as const`;
      return `    ${JSON.stringify(field.fieldId)}: ${allowed},`;
    });

    parentEntries.push(`  ${JSON.stringify(parentId)}: {`, ...fieldEntries, "  },");
  }

  return [
    "/** Allowed resolved entry content type ids per link field (`linkContentType` from CMA). */",
    "export const LINK_FIELD_ALLOWED_CONTENT_TYPES = {",
    ...parentEntries,
    "} as const;",
  ].join("\n");
}

function emitLinkFieldHandlers(targets: LinkFieldTarget[]): string {
  const parentEntries: string[] = [];
  for (const [parentId, fields] of groupLinkFieldTargetsByParent(targets)) {
    const fieldEntries = fields.map((field) => {
      const switchCases = emitHandlerSwitchCases(field.targetContentTypeIds).join("\n");

      return [
        `    ${JSON.stringify(field.fieldId)}: (entry: unknown) => {`,
        `      const parentContentTypeId = ${JSON.stringify(parentId)};`,
        `      const fieldId = ${JSON.stringify(field.fieldId)};`,
        `      const allowed = LINK_FIELD_ALLOWED_CONTENT_TYPES[parentContentTypeId][fieldId];`,
        `      const resolvedId = readResolvedEntryContentTypeId(entry);`,
        `      switch (resolvedId) {`,
        switchCases,
        "      }",
        "    },",
      ].join("\n");
    });

    parentEntries.push(`  ${JSON.stringify(parentId)}: {`, ...fieldEntries, "  },");
  }

  return ["const LINK_FIELD_HANDLERS = {", ...parentEntries, "} as const;"].join("\n");
}

/** Emit link-field target types, handlers, and `parseEntryAsLinkField` (Delivery entry schemas required). */
export function emitLinkFieldParseHelpers(targets: LinkFieldTarget[]): string {
  if (targets.length === 0) {
    return "";
  }

  return [
    "/** Error when a resolved entry's content type is not allowed for a link field (from CMA `linkContentType`). */",
    "export class LinkFieldTargetError extends Error {",
    "  constructor(",
    "    public readonly parentContentTypeId: string,",
    "    public readonly fieldId: string,",
    "    public readonly resolvedContentTypeId: string,",
    "    public readonly allowedContentTypeIds: readonly string[],",
    "  ) {",
    "    super(",
    '      `Entry sys.contentType.sys.id is "${resolvedContentTypeId}" but link field "${parentContentTypeId}.${fieldId}" only allows: ${allowedContentTypeIds.join(", ")}`,',
    "    );",
    "    this.name = 'LinkFieldTargetError';",
    "  }",
    "}",
    "",
    "function readResolvedEntryContentTypeId(entry: unknown): string {",
    "  if (typeof entry !== 'object' || entry === null) {",
    "    throw new Error('Expected a resolved Contentful entry object');",
    "  }",
    "  const sys = (entry as { sys?: unknown }).sys;",
    "  if (typeof sys !== 'object' || sys === null) {",
    "    throw new Error('Resolved entry is missing sys');",
    "  }",
    "  const contentType = (sys as { contentType?: unknown }).contentType;",
    "  if (typeof contentType !== 'object' || contentType === null) {",
    "    throw new Error('Resolved entry sys is missing contentType');",
    "  }",
    "  const contentTypeSys = (contentType as { sys?: unknown }).sys;",
    "  if (typeof contentTypeSys !== 'object' || contentTypeSys === null) {",
    "    throw new Error('Resolved entry sys.contentType is missing sys');",
    "  }",
    "  const id = (contentTypeSys as { id?: unknown }).id;",
    "  if (typeof id !== 'string' || id.length === 0) {",
    "    throw new Error('Resolved entry sys.contentType.sys.id is not a string');",
    "  }",
    "  return id;",
    "}",
    "",
    emitResolvedEntryForLinkFieldMapType(targets),
    "",
    emitLinkFieldHandlersMapType(targets),
    "",
    "export type LinkParentContentTypeId = keyof ResolvedEntryForLinkFieldMap;",
    "",
    "export type LinkFieldName<CType extends LinkParentContentTypeId> =",
    "  keyof ResolvedEntryForLinkFieldMap[CType] & string;",
    "",
    "export type ResolvedEntryForLinkField<",
    "  CType extends LinkParentContentTypeId,",
    "  Field extends LinkFieldName<CType>,",
    "> = ResolvedEntryForLinkFieldMap[CType][Field];",
    "",
    emitLinkFieldAllowedContentTypesMapType(targets),
    "",
    "export type LinkFieldAllowedContentTypes<",
    "  CType extends LinkParentContentTypeId,",
    "  Field extends LinkFieldName<CType> & keyof LinkFieldAllowedContentTypesMap[CType],",
    "> = LinkFieldAllowedContentTypesMap[CType][Field];",
    "",
    emitLinkFieldAllowedContentTypes(targets),
    "",
    emitLinkFieldHandlers(targets),
    "",
    "/**",
    " * Allowed resolved entry content type ids for a parent link field (`linkContentType` from CMA).",
    " */",
    "export function getAllowedEntryLinkContentTypes<",
    "  const CType extends LinkParentContentTypeId,",
    "  const Field extends LinkFieldName<CType> & keyof LinkFieldAllowedContentTypesMap[CType],",
    ">(",
    "  ctype: CType,",
    "  fieldName: Field,",
    "): LinkFieldAllowedContentTypes<CType, Field> {",
    "  return (",
    "    LINK_FIELD_ALLOWED_CONTENT_TYPES[ctype] as LinkFieldAllowedContentTypesMap[CType]",
    "  )[fieldName];",
    "}",
    "",
    "/**",
    " * Parse a resolved entry (include/fetch) for a parent link field, using CMA `linkContentType` rules.",
    " * Return type is a single entry type or a union when the field allows multiple targets.",
    " */",
    "export function parseEntryAsLinkField<",
    "  const CType extends LinkParentContentTypeId,",
    "  const Field extends LinkFieldName<CType>,",
    ">(",
    "  ctype: CType,",
    "  fieldName: Field,",
    "  entry: unknown,",
    "): ResolvedEntryForLinkField<CType, Field> {",
    "  return (",
    "    LINK_FIELD_HANDLERS[ctype] as {",
    "      [F in LinkFieldName<CType>]: (entry: unknown) => ResolvedEntryForLinkField<CType, F>;",
    "    }",
    "  )[fieldName](entry);",
    "}",
    "",
  ].join("\n");
}
