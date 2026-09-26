import {
  type AssetId,
  type AssetPayload,
  type CustomReferenceValue,
  type EntryId,
  type EntryPayload,
  type EnvironmentId,
  type Locale,
  type PagePayload,
  type Sku,
  type SpaceId,
} from "../../generated/page-detail.js";
import { encodeCustomReference } from "../cms/custom-reference.js";

/** Default locale / space / environment for the in-memory fixture graph. */
export const DEMO_LOCALE = "en-US" as Locale;
export const DEMO_SPACE = "marketing" as SpaceId;
export const DEMO_ENVIRONMENT = "master" as EnvironmentId;

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
} as const;

function entryId(id: string): EntryId {
  return id as EntryId;
}
function assetId(id: string): AssetId {
  return id as AssetId;
}
function sku(value: string): Sku {
  return value as Sku;
}

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

/** Root Page document vs polymorphic Entry payload. */
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

/**
 * Editorial documents keyed by `space/environment/id`.
 * Content type lives on Entry payloads (`type`) — not on relationship links.
 */
export const demoEntries: ReadonlyMap<string, EditorialDocument> = new Map([
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.page }),
    {
      kind: "page",
      payload: {
        id: entryId(demoIds.page),
        title: "Homepage",
        menuId: entryId(demoIds.menu),
        footerId: entryId(demoIds.footer),
        strips: [
          { id: entryId(demoIds.tabs) },
          { id: entryId(demoIds.heroWelcome) },
          { id: entryId(demoIds.productTshirt) },
          { id: entryId(demoIds.linkAbout) },
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
        type: "Page",
        id: entryId(demoIds.pageAbout),
        title: "About",
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.menu }),
    {
      kind: "entry",
      payload: {
        type: "Menu",
        id: entryId(demoIds.menu),
        title: "Main menu",
        logoId: assetId(demoIds.assetLogo),
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.footer }),
    {
      kind: "entry",
      payload: {
        type: "Footer",
        id: entryId(demoIds.footer),
        title: "Footer",
        logoId: assetId(demoIds.assetLogo),
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.heroWelcome }),
    {
      kind: "entry",
      payload: {
        type: "Hero",
        id: entryId(demoIds.heroWelcome),
        title: "Welcome",
        imageId: assetId(demoIds.assetHero),
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.heroNested }),
    {
      kind: "entry",
      payload: {
        type: "Hero",
        id: entryId(demoIds.heroNested),
        title: "Nested hero",
        imageId: assetId(demoIds.assetHeroNested),
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.tabs }),
    {
      kind: "entry",
      payload: {
        type: "Tabs",
        id: entryId(demoIds.tabs),
        title: "Featured",
        tabs: [{ id: entryId(demoIds.tabOverview) }],
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.tabOverview }),
    {
      kind: "entry",
      payload: {
        type: "Tab",
        id: entryId(demoIds.tabOverview),
        title: "Overview",
        strips: [{ id: entryId(demoIds.heroNested) }, { id: entryId(demoIds.productHoodie) }],
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.productTshirt }),
    {
      kind: "entry",
      payload: {
        type: "Product",
        id: entryId(demoIds.productTshirt),
        sku: sku("TSHIRT-1"),
        title: "Demo T-Shirt",
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.productHoodie }),
    {
      kind: "entry",
      payload: {
        type: "Product",
        id: entryId(demoIds.productHoodie),
        sku: sku("HOODIE-1"),
        title: "Demo Hoodie",
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.linkAbout }),
    {
      kind: "entry",
      payload: {
        type: "SiteInternalLink",
        id: entryId(demoIds.linkAbout),
        targetId: entryId(demoIds.pageAbout),
      },
    },
  ],
]);

/** CDN / media assets keyed by asset id. */
export const demoAssets: ReadonlyMap<string, AssetPayload> = new Map([
  [
    demoIds.assetLogo,
    {
      type: "Asset",
      id: assetId(demoIds.assetLogo),
      url: "https://cdn.example.com/logo.svg",
      title: "Logo",
      kind: "image",
    },
  ],
  [
    demoIds.assetHero,
    {
      type: "Asset",
      id: assetId(demoIds.assetHero),
      url: "https://cdn.example.com/hero-welcome.jpg",
      title: "Welcome hero",
      kind: "image",
    },
  ],
  [
    demoIds.assetHeroNested,
    {
      type: "Asset",
      id: assetId(demoIds.assetHeroNested),
      url: "https://cdn.example.com/hero-nested.jpg",
      title: "Nested hero",
      kind: "image",
    },
  ],
]);
