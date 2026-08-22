import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import {
  createExpansionPolicyChain,
  defineExpansionPolicy,
  type ExpansionPort,
  type ExpansionResult,
} from "@xndrjs/resource-graph-resolver";

import { cmsAssetAri, cmsEntryAri } from "./cms/ari.js";
import { collectLinkReferencesFromEntryFields } from "./cms/link-field-collector.js";
import type { DemoExecutionContext } from "./demo-execution-context.js";
import { integrationProductAri } from "./integration/ari.js";
import type { DemoContentRegistry } from "./content-registry.js";
import {
  ContentfulEntrySchemaByContentType,
  ProductEntrySchema,
  type ContentfulContentTypeId,
  type ContentfulLocaleCode,
  type ContentfulResolvedEntry,
} from "./cms/generated/contentful.schemas.js";

const EMPTY_EXPANSION: ExpansionResult = { resources: [] };

function linkReferenceToAri(
  link: { linkType: "Entry" | "Asset"; id: string },
  locale: ContentfulLocaleCode
): ApplicationResourceIdentifier {
  return link.linkType === "Entry"
    ? cmsEntryAri({ id: link.id, locale })
    : cmsAssetAri({ id: link.id, locale });
}

function expandLinksFromGeneratedMetadata(
  contentTypeId: ContentfulContentTypeId,
  entry: ContentfulResolvedEntry,
  locale: ContentfulLocaleCode
): ExpansionResult {
  const parsed = ContentfulEntrySchemaByContentType[contentTypeId].parse(entry);
  const links = collectLinkReferencesFromEntryFields(contentTypeId, parsed.fields);

  return {
    resources: links.map((link) => linkReferenceToAri(link, locale)),
  };
}

function expandProductEntry(
  entry: ContentfulResolvedEntry,
  locale: ContentfulLocaleCode
): ExpansionResult {
  const parsed = ProductEntrySchema.parse(entry);
  const sku = parsed.fields.sku;
  if (sku === null || sku.length === 0) {
    return EMPTY_EXPANSION;
  }

  return { resources: [integrationProductAri({ sku, locale })] };
}

/**
 * Default expansion follows generated link-field metadata; overrides handle islands
 * and cross-source rules (e.g. product SKU → integration API).
 */
type ExpansionOverride = {
  expand?: (entry: ContentfulResolvedEntry, locale: ContentfulLocaleCode) => ExpansionResult;
  isIsland?: boolean;
};

const expansionOverrides: Partial<Record<ContentfulContentTypeId, ExpansionOverride>> = {
  menu: { isIsland: true },
  footer: { isIsland: true },
  product: { expand: expandProductEntry },
};

function expandForContentType(
  contentTypeId: ContentfulContentTypeId,
  entry: ContentfulResolvedEntry,
  locale: ContentfulLocaleCode
): ExpansionResult {
  const override = expansionOverrides[contentTypeId];

  const result = override?.expand
    ? override.expand(entry, locale)
    : expandLinksFromGeneratedMetadata(contentTypeId, entry, locale);

  return {
    ...result,
    isIsland: override?.isIsland ?? false,
  };
}

/** ExpansionPort: first matching policy wins; policies authored with `for` / optional `when` / `expand`. */
export function createDemoExpansionPort(): ExpansionPort<
  DemoContentRegistry,
  DemoExecutionContext
> {
  return createExpansionPolicyChain<DemoContentRegistry, DemoExecutionContext>([
    defineExpansionPolicy({
      for: cmsEntryAri,
      when: ({ resource, executionContext }) => resource.key[0].locale === executionContext.locale,
      expand: ({ contentMap, resource, executionContext }) => {
        const entry = contentMap.get(resource);
        if (entry) {
          return expandForContentType(entry.sys.contentType.sys.id, entry, executionContext.locale);
        }

        return EMPTY_EXPANSION;
      },
    }),
  ]);
}
