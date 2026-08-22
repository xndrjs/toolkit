import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import {
  createExpansionPolicyChain,
  defineExpansionPolicy,
  type ExpansionPort,
  type ExpansionResult,
} from "@xndrjs/resource-graph-resolver";

import { cmsAssetAri, cmsEntryAri } from "./cms/ari.js";
import { collectLinkReferencesFromEntryFields } from "./cms/link-field-collector.js";
import { integrationProductAri } from "./integration/ari.js";
import type { DemoContentRegistry } from "./content-registry.js";
import {
  ContentfulContentTypeIdSchema,
  ContentfulEntrySchemaByContentType,
  ProductEntrySchema,
  type ContentfulContentTypeId,
  type ContentfulResolvedEntry,
} from "./cms/generated/contentful.schemas.js";

const EMPTY_EXPANSION: ExpansionResult = { resources: [] };

function linkReferenceToAri(link: {
  linkType: "Entry" | "Asset";
  id: string;
}): ApplicationResourceIdentifier {
  return link.linkType === "Entry" // create ARI based on link type
    ? cmsEntryAri({ id: link.id })
    : cmsAssetAri({ id: link.id });
}

function expandLinksFromGeneratedMetadata(
  contentTypeId: ContentfulContentTypeId,
  entry: ContentfulResolvedEntry
): ExpansionResult {
  const parsed = ContentfulEntrySchemaByContentType[contentTypeId].parse(entry);
  const links = collectLinkReferencesFromEntryFields(contentTypeId, parsed.fields);

  return {
    resources: links.map(linkReferenceToAri),
  };
}

function expandProductEntry(entry: ContentfulResolvedEntry): ExpansionResult {
  const parsed = ProductEntrySchema.parse(entry);
  const sku = parsed.fields.sku;
  if (sku === null || sku.length === 0) {
    return EMPTY_EXPANSION;
  }

  return { resources: [integrationProductAri({ sku })] };
}

/**
 * Default expansion follows generated link-field metadata; overrides handle islands
 * and cross-source rules (e.g. product SKU → integration API).
 */
type ExpansionOverride = {
  expand?: (entry: ContentfulResolvedEntry) => ExpansionResult;
  isIsland?: boolean;
};

const expansionOverrides: Partial<Record<ContentfulContentTypeId, ExpansionOverride>> = {
  menu: { isIsland: true },
  footer: { isIsland: true },
  product: { expand: expandProductEntry },
};

function expandForContentType(
  contentTypeId: ContentfulContentTypeId,
  entry: ContentfulResolvedEntry
): ExpansionResult {
  const override = expansionOverrides[contentTypeId];

  const result = override?.expand
    ? override.expand(entry)
    : expandLinksFromGeneratedMetadata(contentTypeId, entry);

  return {
    ...result,
    isIsland: override?.isIsland ?? false,
  };
}

/** ExpansionPort: first matching policy wins; policies authored inline with typed matches. */
export function createDemoExpansionPort(): ExpansionPort<DemoContentRegistry> {
  return createExpansionPolicyChain<DemoContentRegistry>([
    defineExpansionPolicy({
      matches: cmsEntryAri.matches,
      expand: ({ contentMap, resource }) => {
        const entry = contentMap.get(resource);
        if (!entry) {
          return EMPTY_EXPANSION;
        }

        const parsedId = ContentfulContentTypeIdSchema.safeParse(entry.sys.contentType.sys.id);
        if (!parsedId.success) {
          return EMPTY_EXPANSION;
        }

        return expandForContentType(parsedId.data, entry);
      },
    }),
    defineExpansionPolicy({
      matches: cmsAssetAri.matches,
      expand: () => EMPTY_EXPANSION,
    }),
    defineExpansionPolicy({
      matches: integrationProductAri.matches,
      expand: () => EMPTY_EXPANSION,
    }),
  ]);
}
