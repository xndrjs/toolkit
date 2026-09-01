import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import {
  createExpansionPolicyChain,
  createIslandPolicyChain,
  defineExpansionPolicy,
  defineIslandPolicy,
  type ExpansionPort,
  type ExpansionResult,
  type IslandPort,
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

const ISLAND_CONTENT_TYPES = [
  "menu",
  "footer",
] as const satisfies readonly ContentfulContentTypeId[];

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

type ExpansionOverride = {
  expand: (entry: ContentfulResolvedEntry, locale: ContentfulLocaleCode) => ExpansionResult;
};

const expansionOverrides: Partial<Record<ContentfulContentTypeId, ExpansionOverride>> = {
  product: { expand: expandProductEntry },
};

function expandForContentType(
  contentTypeId: ContentfulContentTypeId,
  entry: ContentfulResolvedEntry,
  locale: ContentfulLocaleCode
): ExpansionResult {
  const override = expansionOverrides[contentTypeId];

  return override?.expand
    ? override.expand(entry, locale)
    : expandLinksFromGeneratedMetadata(contentTypeId, entry, locale);
}

/** ExpansionPort: merges every matching policy; policies authored with `for` / optional `when` / `expand`. */
export function createDemoExpansionPort(): ExpansionPort<
  DemoContentRegistry,
  DemoExecutionContext
> {
  return createExpansionPolicyChain<DemoContentRegistry, DemoExecutionContext>([
    defineExpansionPolicy<
      ReturnType<typeof cmsEntryAri>,
      DemoContentRegistry,
      DemoExecutionContext
    >({
      for: cmsEntryAri,
      when: ({ resource, executionContext }) => resource.key[0].locale === executionContext.locale,
      expand: ({ payload, executionContext }) => {
        return expandForContentType(
          payload.sys.contentType.sys.id,
          payload,
          executionContext.locale
        );
      },
    }),
  ]);
}

/** IslandPort: menu and footer open island boundaries with the same locale gate as expansion. */
export function createDemoIslandPort(): IslandPort<DemoContentRegistry, DemoExecutionContext> {
  return createIslandPolicyChain<DemoContentRegistry, DemoExecutionContext>([
    defineIslandPolicy<ReturnType<typeof cmsEntryAri>, DemoContentRegistry, DemoExecutionContext>({
      for: cmsEntryAri,
      when: ({ resource, payload, executionContext }) =>
        resource.key[0].locale === executionContext.locale &&
        (ISLAND_CONTENT_TYPES as readonly string[]).includes(payload.sys.contentType.sys.id),
      startIsland: () => true,
    }),
  ]);
}
