/**
 * MOCK Contentful Delivery/Preview transport shapes for the demo store.
 *
 * These are hand-written stand-ins for CMS payloads — not generated schemas and
 * not production Contentful SDK types. Generated Zod lives in
 * `src/infrastructure/generated/contentful.schemas.ts`; use those for real parse/hydrate.
 */

/**
 * MOCK: Delivery-like entry envelope.
 * `fields` stay opaque until content-type-specific Zod parse; `sys` is enough
 * to branch expansion (contentType id) without typing the ARI.
 */
export type MockContentfulEntry = {
  sys: MockContentfulEntrySys;
  fields: Record<string, unknown>;
};

/** MOCK: minimal Delivery-like asset payload. */
export type MockContentfulAsset = {
  sys: MockContentfulAssetSys;
  fields: {
    title?: string;
    file: {
      url: string;
      fileName?: string;
      contentType?: string;
    };
  };
};

/** MOCK: Entry → Entry Link stub (`sys.type === "Link"`). */
export type MockContentfulEntryLink = {
  sys: { type: "Link"; linkType: "Entry"; id: string };
};

/** MOCK: Entry → Asset Link stub (`sys.type === "Link"`). */
export type MockContentfulAssetLink = {
  sys: { type: "Link"; linkType: "Asset"; id: string };
};

/** MOCK: loose resource link (space / environment / etc.). */
export type MockContentfulResourceLink = {
  sys: { type: "Link"; linkType: string; id: string };
};

/** MOCK: Entry `sys` block (content-type lives here, not on the ARI). */
export type MockContentfulEntrySys = {
  id: string;
  type: "Entry";
  createdAt: string;
  updatedAt: string;
  revision: number;
  contentType: {
    sys: {
      type: "Link";
      linkType: "ContentType";
      id: string;
    };
  };
  space: MockContentfulResourceLink;
  environment: MockContentfulResourceLink;
};

/** MOCK: Asset `sys` block. */
export type MockContentfulAssetSys = {
  id: string;
  type: "Asset";
  createdAt: string;
  updatedAt: string;
  revision: number;
  space: MockContentfulResourceLink;
  environment: MockContentfulResourceLink;
};

const MOCK_SPACE_LINK: MockContentfulResourceLink = {
  sys: { type: "Link", linkType: "Space", id: "demo-space" },
};

const MOCK_ENVIRONMENT_LINK: MockContentfulResourceLink = {
  sys: { type: "Link", linkType: "Environment", id: "master" },
};

const MOCK_TIMESTAMP = "2026-01-01T00:00:00.000Z";

/** MOCK helper: Entry Link stub. */
export function mockEntryLink(id: string): MockContentfulEntryLink {
  return { sys: { type: "Link", linkType: "Entry", id } };
}

/** MOCK helper: Asset Link stub. */
export function mockAssetLink(id: string): MockContentfulAssetLink {
  return { sys: { type: "Link", linkType: "Asset", id } };
}

/** MOCK helper: Entry `sys` for fixture builders. */
export function mockEntrySys(id: string, contentTypeId: string): MockContentfulEntrySys {
  return {
    id,
    type: "Entry",
    createdAt: MOCK_TIMESTAMP,
    updatedAt: MOCK_TIMESTAMP,
    revision: 1,
    contentType: {
      sys: {
        type: "Link",
        linkType: "ContentType",
        id: contentTypeId,
      },
    },
    space: MOCK_SPACE_LINK,
    environment: MOCK_ENVIRONMENT_LINK,
  };
}

/** MOCK helper: Asset `sys` for fixture builders. */
export function mockAssetSys(id: string): MockContentfulAssetSys {
  return {
    id,
    type: "Asset",
    createdAt: MOCK_TIMESTAMP,
    updatedAt: MOCK_TIMESTAMP,
    revision: 1,
    space: MOCK_SPACE_LINK,
    environment: MOCK_ENVIRONMENT_LINK,
  };
}
