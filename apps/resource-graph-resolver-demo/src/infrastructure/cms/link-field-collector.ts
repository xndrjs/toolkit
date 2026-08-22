import {
  LINK_FIELDS_BY_CONTENT_TYPE,
  type ContentfulContentTypeId,
  type ContentfulEntryByContentType,
  type LinkFieldDescriptor,
} from "./generated/contentful.schemas.js";

export type ResolvedLinkReference = {
  linkType: LinkFieldDescriptor["linkType"];
  id: string;
};

/** Delivery link stub — shape already validated by `ContentfulEntrySchemaByContentType`. */
type LinkStub = { sys: { id: string } };

/**
 * Collect Entry/Asset link ids from delivery fields already validated by the entry schema.
 * Field selection and order come from `LINK_FIELDS_BY_CONTENT_TYPE`.
 */
export function collectLinkReferencesFromEntryFields<T extends ContentfulContentTypeId>(
  contentTypeId: T,
  fields: ContentfulEntryByContentType[T]["fields"]
): ResolvedLinkReference[] {
  const descriptors = LINK_FIELDS_BY_CONTENT_TYPE[contentTypeId];
  const links: ResolvedLinkReference[] = [];
  const linkFields = fields as Record<string, LinkStub | readonly LinkStub[] | null | undefined>;

  for (const descriptor of descriptors) {
    const value = linkFields[descriptor.fieldId];
    if (value === null || value === undefined) {
      continue;
    }

    if (descriptor.cardinality === "many") {
      for (const stub of value as readonly LinkStub[]) {
        links.push({ linkType: descriptor.linkType, id: stub.sys.id });
      }
      continue;
    }

    links.push({ linkType: descriptor.linkType, id: (value as LinkStub).sys.id });
  }

  return links;
}
