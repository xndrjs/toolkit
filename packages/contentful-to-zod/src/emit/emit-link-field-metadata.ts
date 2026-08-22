import type { ContentType } from "../model/content-type";
import type { LinkFieldDescriptor } from "./link-fields";

function groupLinkFieldsByParent(
  linkFields: LinkFieldDescriptor[]
): Map<string, LinkFieldDescriptor[]> {
  const byParent = new Map<string, LinkFieldDescriptor[]>();
  for (const linkField of linkFields) {
    const list = byParent.get(linkField.parentContentTypeId) ?? [];
    list.push(linkField);
    byParent.set(linkField.parentContentTypeId, list);
  }
  return byParent;
}

function emitLinkFieldDescriptorEntry(linkField: LinkFieldDescriptor): string {
  return [
    "{",
    `  fieldId: ${JSON.stringify(linkField.fieldId)},`,
    `  linkType: ${JSON.stringify(linkField.linkType)},`,
    `  cardinality: ${JSON.stringify(linkField.cardinality)},`,
    "}",
  ].join("\n");
}

function emitLinkFieldsByContentType(
  contentTypes: ContentType[],
  linkFields: LinkFieldDescriptor[]
): string {
  const byParent = groupLinkFieldsByParent(linkFields);
  const parentEntries = contentTypes.map((contentType) => {
    const fields = byParent.get(contentType.id) ?? [];
    const fieldEntries = fields.map((field) => `    ${emitLinkFieldDescriptorEntry(field)},`);
    return [`  ${JSON.stringify(contentType.id)}: [`, ...fieldEntries, "  ],"].join("\n");
  });

  return [
    "/**",
    " * Entry/Asset link fields per content type (from CMA).",
    " * Order follows the content model field order.",
    " */",
    "export const LINK_FIELDS_BY_CONTENT_TYPE = {",
    ...parentEntries,
    "} as const satisfies Record<ContentfulContentTypeId, readonly LinkFieldDescriptor[]>;",
  ].join("\n");
}

/** Emit link-field metadata derived from the content model snapshot. */
export function emitLinkFieldMetadata(
  contentTypes: ContentType[],
  linkFields: LinkFieldDescriptor[]
): string {
  return [
    "export type LinkFieldDescriptor = {",
    "  fieldId: string;",
    '  linkType: "Entry" | "Asset";',
    '  cardinality: "one" | "many";',
    "};",
    "",
    emitLinkFieldsByContentType(contentTypes, linkFields),
    "",
  ].join("\n");
}
