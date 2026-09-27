import {
  Scalars,
  type AssetPayload,
  type CustomReferenceValue,
  type EntryPayload,
  type PagePayload,
} from "../../generated";
import { encodeCustomReference } from "../cms/custom-reference.js";

/** Default locale / space / environment for the in-memory fixture graph. */
export const DEMO_LOCALE = Scalars.Locale("en-US");
export const DEMO_SPACE = Scalars.SpaceId("marketing");
export const DEMO_ENVIRONMENT = Scalars.EnvironmentId("master");

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
        type: "Page",
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
        type: "Menu",
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
        type: "Footer",
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
        type: "Hero",
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
        type: "Hero",
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
        type: "Tabs",
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
        type: "Tab",
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
        type: "Product",
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
        type: "Product",
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
        type: "SiteInternalLink",
        id: Scalars.EntryId(demoIds.linkAbout),
        targetId: Scalars.EntryId(demoIds.pageAbout),
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
      id: Scalars.AssetId(demoIds.assetLogo),
      url: "https://cdn.example.com/logo.svg",
      title: "Logo",
      kind: "image",
    },
  ],
  [
    demoIds.assetHero,
    {
      type: "Asset",
      id: Scalars.AssetId(demoIds.assetHero),
      url: "https://cdn.example.com/hero-welcome.jpg",
      title: "Welcome hero",
      kind: "image",
    },
  ],
  [
    demoIds.assetHeroNested,
    {
      type: "Asset",
      id: Scalars.AssetId(demoIds.assetHeroNested),
      url: "https://cdn.example.com/hero-nested.jpg",
      title: "Nested hero",
      kind: "image",
    },
  ],
]);
