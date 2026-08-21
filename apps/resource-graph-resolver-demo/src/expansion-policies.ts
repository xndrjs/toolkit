import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import {
  createExpansionPolicyChain,
  type ExpansionContext,
  type ExpansionPolicy,
  type ExpansionPort,
  type ExpansionResult,
} from "@xndrjs/resource-graph-resolver";

import { assetAri, entryAri } from "./ari.js";
import type { DemoContentRegistry } from "./content-registry.js";
import {
  ContentfulContentTypeIdSchema,
  ContentfulEntrySchemaByContentType,
  type ContentfulContentTypeId,
  type ContentfulEntryByContentType,
} from "./generated/contentful.schemas.js";

type EntryLink = { sys: { type: "Link"; linkType: "Entry"; id: string } };
type AssetLink = { sys: { type: "Link"; linkType: "Asset"; id: string } };

const EMPTY_EXPANSION: ExpansionResult = { resources: [] };

function entryChildrenFromLinks(
  links: readonly EntryLink[] | null | undefined
): ApplicationResourceIdentifier[] {
  if (!links) {
    return [];
  }
  // Opaque entry ARIs — target content-type is unknown until resolve.
  return links.map((link) => entryAri(link.sys.id));
}

function entryChildFromLink(link: EntryLink | null | undefined): ApplicationResourceIdentifier[] {
  return link ? [entryAri(link.sys.id)] : [];
}

function assetChildFromLink(link: AssetLink | null | undefined): ApplicationResourceIdentifier[] {
  return link ? [assetAri(link.sys.id)] : [];
}

type ExpandByContentType = {
  [K in ContentfulContentTypeId]: (entry: ContentfulEntryByContentType[K]) => ExpansionResult;
};

/**
 * Content-type → child Link extraction (generated Entry schemas as field contract).
 * Branching is on `sys.contentType.sys.id`, not on ARI `type` (always `"entry"`).
 * Required keys track {@link ContentfulContentTypeId} from codegen.
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
    // Polymorphic strips (hero | product): each Link → opaque entry ARI.
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
  product(_entry) {
    return EMPTY_EXPANSION;
  },
} satisfies ExpandByContentType;

function expandForContentType(
  contentTypeId: ContentfulContentTypeId,
  raw: unknown
): ExpansionResult {
  // Indexed access loses key→value correlation; re-assert after id narrowing + parse.
  const entry = ContentfulEntrySchemaByContentType[contentTypeId].parse(raw);
  const expand = expandByContentType[contentTypeId] as (value: typeof entry) => ExpansionResult;
  return expand(entry);
}

function expandResolvedEntry({
  contentMap,
  resource,
}: ExpansionContext<DemoContentRegistry>): ExpansionResult {
  const entry = contentMap.get(resource as ApplicationResourceIdentifier<"entry">);
  if (!entry) {
    return EMPTY_EXPANSION;
  }

  const parsedId = ContentfulContentTypeIdSchema.safeParse(entry.sys.contentType.sys.id);
  if (!parsedId.success) {
    return EMPTY_EXPANSION;
  }

  return expandForContentType(parsedId.data, entry);
}

/**
 * Demo expansion policies: ARI `matches` only distinguishes entry vs asset;
 * entry children and islands come from the resolved Contentful content-type.
 */
export function createDemoExpansionPolicies(): ExpansionPolicy<DemoContentRegistry>[] {
  return [
    {
      matches: (resource) => resource.type === "entry",
      expand: expandResolvedEntry,
    },
    {
      matches: (resource) => resource.type === "asset",
      expand: () => EMPTY_EXPANSION,
    },
  ];
}

/** ExpansionPort composed from {@link createDemoExpansionPolicies}. */
export function createDemoExpansionPort(): ExpansionPort<DemoContentRegistry> {
  return createExpansionPolicyChain(createDemoExpansionPolicies());
}
