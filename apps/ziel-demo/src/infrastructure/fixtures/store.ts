import {
  Scalars,
  type AssetPayload,
  type CustomReferenceValue,
  type EntryPayload,
  type ErrorLabPayload,
  type PagePayload,
} from "../../generated";
import { encodeCustomReference } from "../cms/custom-reference.js";

/** Default locale / space / environment for the in-memory fixture graph. */
export const DEMO_LOCALE = Scalars.Locale("en-US");
export const DEMO_SPACE = Scalars.SpaceId("marketing");
export const DEMO_ENVIRONMENT = Scalars.EnvironmentId("master");

/** Id used by error-handling labs for expands that should fail to load. */
export const MISSING_ENTRY_ID = "missing-entry";

/** Stable demo entry ids (shared Entry ID namespace). */
export const demoIds = {
  page: "page-home",
  pageAbout: "page-about",
  menu: "menu-main",
  footer: "footer-main",
  tabs: "tabs-featured",
  tabOverview: "tab-overview",
  heroWelcome: "hero-welcome",
  heroNested: "hero-nested",
  productTshirt: "product-tshirt",
  productHoodie: "product-hoodie",
  linkAbout: "link-about",
  assetLogo: "asset-logo",
  assetHero: "asset-hero",
  assetHeroNested: "asset-hero-nested",
  /** Error-handling showcase roots (`/error-handling/[id]`). */
  ehSoftSingle: "eh-soft-single",
  ehErrorSingle: "eh-error-single",
  ehThrowSingle: "eh-throw-single",
  ehSoftItems: "eh-soft-items",
  ehErrorItems: "eh-error-items",
  ehThrowItems: "eh-throw-items",
} as const;

/** Case catalog for the error-handling demo routes. */
export const ERROR_HANDLING_CASES = [
  {
    id: demoIds.ehSoftSingle,
    label: "Single · set null",
    policy: "set null" as const,
    shape: "single" as const,
  },
  {
    id: demoIds.ehErrorSingle,
    label: "Single · set error",
    policy: "set error" as const,
    shape: "single" as const,
  },
  {
    id: demoIds.ehThrowSingle,
    label: "Single · throw",
    policy: "throw" as const,
    shape: "single" as const,
  },
  {
    id: demoIds.ehSoftItems,
    label: "Array · set null",
    policy: "set null" as const,
    shape: "array" as const,
  },
  {
    id: demoIds.ehErrorItems,
    label: "Array · set error",
    policy: "set error" as const,
    shape: "array" as const,
  },
  {
    id: demoIds.ehThrowItems,
    label: "Array · throw",
    policy: "throw" as const,
    shape: "array" as const,
  },
] as const;

export type ErrorHandlingCaseId = (typeof ERROR_HANDLING_CASES)[number]["id"];

/** Encoded custom ref pointing at the welcome hero (same canonical Entry as strips). */
export const demoHeroWelcomeCustomRef: CustomReferenceValue = encodeCustomReference({
  environmentId: DEMO_ENVIRONMENT,
  spaceId: DEMO_SPACE,
  kind: "ENTRY",
  id: demoIds.heroWelcome,
});

/** Encoded custom ref pointing at the logo asset. */
export const demoLogoAssetCustomRef: CustomReferenceValue = encodeCustomReference({
  environmentId: DEMO_ENVIRONMENT,
  spaceId: DEMO_SPACE,
  kind: "ASSET",
  id: demoIds.assetLogo,
});

/** Root Page document vs polymorphic Entry payload (CMS / page-detail store). */
export type EditorialDocument =
  | { kind: "page"; payload: PagePayload }
  | { kind: "entry"; payload: EntryPayload };

export function entryLookupKey(parts: {
  spaceId: string;
  environmentId: string;
  id: string;
}): string {
  return `${parts.spaceId}/${parts.environmentId}/${parts.id}`;
}

const spaceId = DEMO_SPACE;
const environmentId = DEMO_ENVIRONMENT;

const okEntry = Scalars.EntryId(demoIds.heroWelcome);
const missingEntry = Scalars.EntryId(MISSING_ENTRY_ID);

function errorLabPayload(
  id: string,
  title: string,
  overrides: Partial<Omit<ErrorLabPayload, "id" | "title">>
): ErrorLabPayload {
  return {
    id: Scalars.EntryId(id),
    title,
    softSingleId: okEntry,
    errorSingleId: okEntry,
    throwSingleId: okEntry,
    softItems: [],
    errorItems: [],
    throwItems: [],
    ...overrides,
  };
}

/**
 * Editorial documents keyed by `space/environment/id`.
 * Content type lives on Entry payloads (`kind`) — not on relationship links.
 */
export const demoEntries: ReadonlyMap<string, EditorialDocument> = new Map([
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.page }),
    {
      kind: "page",
      payload: {
        id: Scalars.EntryId(demoIds.page),
        title: "Homepage",
        menuId: Scalars.EntryId(demoIds.menu),
        footerId: Scalars.EntryId(demoIds.footer),
        strips: [
          { id: Scalars.EntryId(demoIds.tabs) },
          { id: Scalars.EntryId(demoIds.heroWelcome) },
          { id: Scalars.EntryId(demoIds.productTshirt) },
          { id: Scalars.EntryId(demoIds.linkAbout) },
        ],
        related: [demoHeroWelcomeCustomRef, demoLogoAssetCustomRef],
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.pageAbout }),
    {
      kind: "entry",
      payload: {
        kind: "Page",
        id: Scalars.EntryId(demoIds.pageAbout),
        title: "About",
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.menu }),
    {
      kind: "entry",
      payload: {
        kind: "Menu",
        id: Scalars.EntryId(demoIds.menu),
        title: "Main menu",
        logoId: Scalars.AssetId(demoIds.assetLogo),
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.footer }),
    {
      kind: "entry",
      payload: {
        kind: "Footer",
        id: Scalars.EntryId(demoIds.footer),
        cta: "Contact us",
        title: "Footer",
        logoId: Scalars.AssetId(demoIds.assetLogo),
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.heroWelcome }),
    {
      kind: "entry",
      payload: {
        kind: "Hero",
        id: Scalars.EntryId(demoIds.heroWelcome),
        title: "Welcome",
        imageId: Scalars.AssetId(demoIds.assetHero),
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.heroNested }),
    {
      kind: "entry",
      payload: {
        kind: "Hero",
        id: Scalars.EntryId(demoIds.heroNested),
        title: "Nested hero",
        imageId: Scalars.AssetId(demoIds.assetHeroNested),
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.tabs }),
    {
      kind: "entry",
      payload: {
        kind: "Tabs",
        id: Scalars.EntryId(demoIds.tabs),
        title: "Featured",
        tabs: [{ id: Scalars.EntryId(demoIds.tabOverview) }],
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.tabOverview }),
    {
      kind: "entry",
      payload: {
        kind: "Tab",
        id: Scalars.EntryId(demoIds.tabOverview),
        title: "Overview",
        strips: [
          { id: Scalars.EntryId(demoIds.heroNested) },
          { id: Scalars.EntryId(demoIds.productHoodie) },
        ],
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.productTshirt }),
    {
      kind: "entry",
      payload: {
        kind: "Product",
        id: Scalars.EntryId(demoIds.productTshirt),
        sku: Scalars.Sku("TSHIRT-1"),
        title: "Demo T-Shirt",
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.productHoodie }),
    {
      kind: "entry",
      payload: {
        kind: "Product",
        id: Scalars.EntryId(demoIds.productHoodie),
        sku: Scalars.Sku("HOODIE-1"),
        title: "Demo Hoodie",
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.linkAbout }),
    {
      kind: "entry",
      payload: {
        kind: "SiteInternalLink",
        id: Scalars.EntryId(demoIds.linkAbout),
        targetId: Scalars.EntryId(demoIds.pageAbout),
      },
    },
  ],
]);

/**
 * ErrorLab showcase roots keyed by `space/environment/id`.
 * Served by `ErrorLabStore`, not `CmsEntries`.
 */
export const demoErrorLabs: ReadonlyMap<string, ErrorLabPayload> = new Map([
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.ehSoftSingle }),
    errorLabPayload(demoIds.ehSoftSingle, "Soft single (set null)", {
      softSingleId: missingEntry,
    }),
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.ehErrorSingle }),
    errorLabPayload(demoIds.ehErrorSingle, "Error single (set error)", {
      errorSingleId: missingEntry,
    }),
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.ehThrowSingle }),
    errorLabPayload(demoIds.ehThrowSingle, "Throw single", {
      throwSingleId: missingEntry,
    }),
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.ehSoftItems }),
    errorLabPayload(demoIds.ehSoftItems, "Soft items (set null)", {
      softItems: [{ id: okEntry }, { id: missingEntry }],
    }),
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.ehErrorItems }),
    errorLabPayload(demoIds.ehErrorItems, "Error items (set error)", {
      errorItems: [{ id: okEntry }, { id: missingEntry }],
    }),
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.ehThrowItems }),
    errorLabPayload(demoIds.ehThrowItems, "Throw items", {
      throwItems: [{ id: missingEntry }],
    }),
  ],
]);

/** CDN / media assets keyed by asset id. */
export const demoAssets: ReadonlyMap<string, AssetPayload> = new Map([
  [
    demoIds.assetLogo,
    {
      kind: "Asset",
      id: Scalars.AssetId(demoIds.assetLogo),
      url: "https://cdn.example.com/logo.svg",
      title: "Logo",
      asset_type: "image",
    },
  ],
  [
    demoIds.assetHero,
    {
      kind: "Asset",
      id: Scalars.AssetId(demoIds.assetHero),
      url: "https://cdn.example.com/hero-welcome.jpg",
      title: "Welcome hero",
      asset_type: "image",
    },
  ],
  [
    demoIds.assetHeroNested,
    {
      kind: "Asset",
      id: Scalars.AssetId(demoIds.assetHeroNested),
      url: "https://cdn.example.com/hero-nested.jpg",
      title: "Nested hero",
      asset_type: "image",
    },
  ],
]);
