import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import {
  createExpansionPolicyChain,
  defineExpansionPolicy,
  type ExpansionPort,
  type ExpansionResult,
} from "@xndrjs/resource-graph-resolver";

import { cmsAssetAri, cmsEntryAri } from "./cms/ari.js";
import { integrationProductAri } from "./integration/ari.js";
import type { DemoContentRegistry } from "./content-registry.js";
import {
  ContentfulContentTypeIdSchema,
  ContentfulEntrySchemaByContentType,
  type ContentfulAssetLink,
  type ContentfulContentTypeId,
  type ContentfulEntryByContentType,
  type ContentfulEntryLink,
} from "./cms/generated/contentful.schemas.js";

const EMPTY_EXPANSION: ExpansionResult = { resources: [] };

function entryChildrenFromLinks(
  links: readonly ContentfulEntryLink[] | null | undefined
): ApplicationResourceIdentifier[] {
  if (!links) {
    return [];
  }
  return links.map((link) => cmsEntryAri({ id: link.sys.id }));
}

function entryChildFromLink(
  link: ContentfulEntryLink | null | undefined
): ApplicationResourceIdentifier[] {
  return link ? [cmsEntryAri({ id: link.sys.id })] : [];
}

function assetChildFromLink(
  link: ContentfulAssetLink | null | undefined
): ApplicationResourceIdentifier[] {
  return link ? [cmsAssetAri({ id: link.sys.id })] : [];
}

type ExpandByContentType = {
  [K in ContentfulContentTypeId]: (entry: ContentfulEntryByContentType[K]) => ExpansionResult;
};

/**
 * Content-type → child Link extraction (generated Entry schemas as field contract).
 * Branching is on `sys.contentType.sys.id`, not on ARI `type` (always `"cms.entry"`).
 */
const expandByContentType = {
  page(entry) {
    return {
      resources: [
        ...entryChildrenFromLinks(entry.fields.modules),
        ...entryChildFromLink(entry.fields.menu),
        ...entryChildFromLink(entry.fields.footer),
      ],
    };
  },
  tabs(entry) {
    return { resources: entryChildrenFromLinks(entry.fields.tabs) };
  },
  tab(entry) {
    // Polymorphic strips (hero | product): each Link → opaque cms.entry ARI.
    return { resources: entryChildrenFromLinks(entry.fields.strips) };
  },
  hero(entry) {
    return { resources: assetChildFromLink(entry.fields.image) };
  },
  menu(entry) {
    return {
      resources: assetChildFromLink(entry.fields.logo),
      isIsland: true,
    };
  },
  footer(entry) {
    return {
      resources: assetChildFromLink(entry.fields.logo),
      isIsland: true,
    };
  },
  product(entry) {
    const sku = entry.fields.sku;
    if (sku === null || sku.length === 0) {
      return EMPTY_EXPANSION;
    }
    // Commercial data lives on the integration source, keyed by SKU.
    return { resources: [integrationProductAri({ sku })] };
  },
} satisfies ExpandByContentType;

function expandForContentType(
  contentTypeId: ContentfulContentTypeId,
  raw: unknown
): ExpansionResult {
  const entry = ContentfulEntrySchemaByContentType[contentTypeId].parse(raw);
  const expand = expandByContentType[contentTypeId] as (value: typeof entry) => ExpansionResult;
  return expand(entry);
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
