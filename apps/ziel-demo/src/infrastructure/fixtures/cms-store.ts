/**
 * Editorial CMS fixtures as wire shapes (plain strings).
 * Adapters parse + map to branded Ziel payloads at the loader boundary.
 */
import { Scalars, type CustomReferenceValue } from "../../generated/resources";
import type { AssetPayloadWire } from "../cms/schemas/asset.js";
import type { EntryPayloadWire } from "../cms/schemas/entry.js";
import type { PagePayloadWire } from "../cms/schemas/page.js";
import type { TaxonomyTermPayloadWire } from "../cms/schemas/taxonomy-term.js";
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
  /** Taxonomy terms addressed by composite `(kind, id)`. */
  termCategoryApparel: "apparel",
  termTagFeatured: "featured",
  termTagNew: "new",
  /** Error-handling showcase roots (`/error-handling/[id]`). */
  ehSoftSingle: "eh-soft-single",
  ehErrorSingle: "eh-error-single",
  ehThrowSingle: "eh-throw-single",
  ehSoftItems: "eh-soft-items",
  ehErrorItems: "eh-error-items",
  ehThrowItems: "eh-throw-items",
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

/** Root Page document vs polymorphic Entry payload (CMS / page-detail store). */
export type EditorialDocument =
  | { kind: "page"; payload: PagePayloadWire }
  | { kind: "entry"; payload: EntryPayloadWire };

export function entryLookupKey(parts: {
  spaceId: string;
  environmentId: string;
  id: string;
}): string {
  return `${parts.spaceId}/${parts.environmentId}/${parts.id}`;
}

export function taxonomyTermLookupKey(parts: {
  spaceId: string;
  environmentId: string;
  kind: string;
  id: string;
}): string {
  return `${parts.spaceId}/${parts.environmentId}/${parts.kind}/${parts.id}`;
}

/** Demo taxonomy kinds used in composite-key links. */
export const demoTaxonomyKinds = {
  category: "category",
  tag: "tag",
} as const;

const spaceId = DEMO_SPACE;
const environmentId = DEMO_ENVIRONMENT;

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
        id: demoIds.page,
        title: "Homepage",
        menuId: demoIds.menu,
        footerId: demoIds.footer,
        strips: [
          { id: demoIds.tabs },
          { id: demoIds.heroWelcome },
          { id: demoIds.productTshirt },
          { id: demoIds.linkAbout },
        ],
        related: [demoHeroWelcomeCustomRef, demoLogoAssetCustomRef],
        primaryTerm: {
          kind: demoTaxonomyKinds.category,
          id: demoIds.termCategoryApparel,
        },
        relatedTerms: [
          { kind: demoTaxonomyKinds.tag, id: demoIds.termTagFeatured },
          { kind: demoTaxonomyKinds.tag, id: demoIds.termTagNew },
        ],
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.pageAbout }),
    {
      kind: "entry",
      payload: {
        kind: "Page",
        id: demoIds.pageAbout,
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
        id: demoIds.menu,
        title: "Main menu",
        logoId: demoIds.assetLogo,
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.footer }),
    {
      kind: "entry",
      payload: {
        kind: "Footer",
        id: demoIds.footer,
        cta: "Contact us",
        title: "Footer",
        logoId: demoIds.assetLogo,
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.heroWelcome }),
    {
      kind: "entry",
      payload: {
        kind: "Hero",
        id: demoIds.heroWelcome,
        title: "Welcome",
        body: {
          version: 1 as const,
          blocks: [{ type: "paragraph" as const, text: "Welcome to the homepage hero." }],
        },
        imageId: demoIds.assetHero,
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.heroNested }),
    {
      kind: "entry",
      payload: {
        kind: "Hero",
        id: demoIds.heroNested,
        title: "Nested hero",
        body: {
          version: 1 as const,
          blocks: [{ type: "paragraph" as const, text: "Nested hero rich body." }],
        },
        imageId: demoIds.assetHeroNested,
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.tabs }),
    {
      kind: "entry",
      payload: {
        kind: "Tabs",
        id: demoIds.tabs,
        title: "Featured",
        tabs: [{ id: demoIds.tabOverview }],
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.tabOverview }),
    {
      kind: "entry",
      payload: {
        kind: "Tab",
        id: demoIds.tabOverview,
        title: "Overview",
        strips: [{ id: demoIds.heroNested }, { id: demoIds.productHoodie }],
      },
    },
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.productTshirt }),
    {
      kind: "entry",
      payload: {
        kind: "Product",
        id: demoIds.productTshirt,
        sku: "TSHIRT-1",
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
        id: demoIds.productHoodie,
        sku: "HOODIE-1",
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
        id: demoIds.linkAbout,
        targetId: demoIds.pageAbout,
      },
    },
  ],
]);

/** CDN / media assets keyed by asset id. */
export const demoAssets: ReadonlyMap<string, AssetPayloadWire> = new Map([
  [
    demoIds.assetLogo,
    {
      kind: "Asset",
      id: demoIds.assetLogo,
      url: "https://cdn.example.com/logo.svg",
      title: "Logo",
      asset_type: "image",
      descriptor: {
        provider: "cdn" as const,
        width: 256,
        height: 256,
        focalPoint: { x: 0.5, y: 0.5 },
      },
    },
  ],
  [
    demoIds.assetHero,
    {
      kind: "Asset",
      id: demoIds.assetHero,
      url: "https://cdn.example.com/hero-welcome.jpg",
      title: "Welcome hero",
      asset_type: "image",
      descriptor: {
        provider: "cdn" as const,
        width: 1600,
        height: 900,
        focalPoint: { x: 0.45, y: 0.35 },
      },
    },
  ],
  [
    demoIds.assetHeroNested,
    {
      kind: "Asset",
      id: demoIds.assetHeroNested,
      url: "https://cdn.example.com/hero-nested.jpg",
      title: "Nested hero",
      asset_type: "image",
      descriptor: {
        provider: "cdn" as const,
        width: 1200,
        height: 800,
        focalPoint: { x: 0.5, y: 0.4 },
      },
    },
  ],
]);

/** Taxonomy terms keyed by `space/environment/kind/id` (composite identity). */
export const demoTaxonomyTerms: ReadonlyMap<string, TaxonomyTermPayloadWire> = new Map([
  [
    taxonomyTermLookupKey({
      spaceId,
      environmentId,
      kind: demoTaxonomyKinds.category,
      id: demoIds.termCategoryApparel,
    }),
    {
      kind: demoTaxonomyKinds.category,
      id: demoIds.termCategoryApparel,
      label: "Apparel",
      slug: "apparel",
    },
  ],
  [
    taxonomyTermLookupKey({
      spaceId,
      environmentId,
      kind: demoTaxonomyKinds.tag,
      id: demoIds.termTagFeatured,
    }),
    {
      kind: demoTaxonomyKinds.tag,
      id: demoIds.termTagFeatured,
      label: "Featured",
      slug: "featured",
    },
  ],
  [
    taxonomyTermLookupKey({
      spaceId,
      environmentId,
      kind: demoTaxonomyKinds.tag,
      id: demoIds.termTagNew,
    }),
    {
      kind: demoTaxonomyKinds.tag,
      id: demoIds.termTagNew,
      label: "New",
      slug: "new",
    },
  ],
]);
