import { cmsAssetAri, cmsEntryAri } from "./ari.js";
import type { CmsFixtureStore } from "./data-adapter.js";
import type { ContentfulAsset, ContentfulResolvedEntry } from "./generated/contentful.schemas.js";
import type {
  FooterEntry,
  HeroEntry,
  MenuEntry,
  PageEntry,
  ProductEntry,
  TabEntry,
  TabsEntry,
} from "./generated/contentful.schemas.js";

/** Demo resource ids used by the in-memory CMS fixtures. */
export const demoIds = {
  page: "page-home",
  tabs: "tabs-main",
  tab: "tab-1",
  hero: "hero-banner",
  product: "product-tshirt",
  menu: "menu-main",
  footer: "footer-main",
  logo: "asset-logo",
  productSku: "TSHIRT-1",
} as const;

export const pageEntryAri = cmsEntryAri({ id: demoIds.page });
export const tabsEntryAri = cmsEntryAri({ id: demoIds.tabs });
export const tabEntryAri = cmsEntryAri({ id: demoIds.tab });
export const heroEntryAri = cmsEntryAri({ id: demoIds.hero });
export const productEntryAri = cmsEntryAri({ id: demoIds.product });
export const menuEntryAri = cmsEntryAri({ id: demoIds.menu });
export const footerEntryAri = cmsEntryAri({ id: demoIds.footer });
export const logoAssetAri = cmsAssetAri({ id: demoIds.logo });

const demoTimestamp = "2026-01-01T00:00:00.000Z";
const demoSpace = { sys: { type: "Link" as const, linkType: "Space", id: "demo-space" } };
const demoEnvironment = { sys: { type: "Link" as const, linkType: "Environment", id: "master" } };

const pageEntry = {
  sys: {
    id: demoIds.page,
    type: "Entry" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    contentType: {
      sys: { type: "Link" as const, linkType: "ContentType" as const, id: "page" as const },
    },
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: { "en-US": "Homepage", "it-IT": "Pagina iniziale" },
    modules: [
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.tabs } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.product } },
    ],
    menu: { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.menu } },
    footer: { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.footer } },
  },
} satisfies PageEntry;

const tabsEntry = {
  sys: {
    id: demoIds.tabs,
    type: "Entry" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    contentType: {
      sys: { type: "Link" as const, linkType: "ContentType" as const, id: "tabs" as const },
    },
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: { "en-US": "Featured", "it-IT": "In evidenza" },
    tabs: [{ sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.tab } }],
  },
} satisfies TabsEntry;

const tabEntry = {
  sys: {
    id: demoIds.tab,
    type: "Entry" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    contentType: {
      sys: { type: "Link" as const, linkType: "ContentType" as const, id: "tab" as const },
    },
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: { "en-US": "Overview", "it-IT": "Panoramica" },
    strips: [
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.hero } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.product } },
    ],
  },
} satisfies TabEntry;

const heroEntry = {
  sys: {
    id: demoIds.hero,
    type: "Entry" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    contentType: {
      sys: { type: "Link" as const, linkType: "ContentType" as const, id: "hero" as const },
    },
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: { "en-US": "Welcome", "it-IT": "Benvenuti" },
    image: { sys: { type: "Link" as const, linkType: "Asset" as const, id: demoIds.logo } },
  },
} satisfies HeroEntry;

const productEntry = {
  sys: {
    id: demoIds.product,
    type: "Entry" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    contentType: {
      sys: { type: "Link" as const, linkType: "ContentType" as const, id: "product" as const },
    },
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    sku: demoIds.productSku,
    title: { "en-US": "T-Shirt", "it-IT": "Maglietta" },
    description: {
      "en-US": "A demo t-shirt from CMS.",
      "it-IT": "Una maglietta demo dal CMS.",
    },
  },
} satisfies ProductEntry;

const menuEntry = {
  sys: {
    id: demoIds.menu,
    type: "Entry" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    contentType: {
      sys: { type: "Link" as const, linkType: "ContentType" as const, id: "menu" as const },
    },
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: "Main menu",
    logo: { sys: { type: "Link" as const, linkType: "Asset" as const, id: demoIds.logo } },
  },
} satisfies MenuEntry;

const footerEntry = {
  sys: {
    id: demoIds.footer,
    type: "Entry" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    contentType: {
      sys: { type: "Link" as const, linkType: "ContentType" as const, id: "footer" as const },
    },
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: "Footer",
    logo: { sys: { type: "Link" as const, linkType: "Asset" as const, id: demoIds.logo } },
  },
} satisfies FooterEntry;

const logoAsset = {
  sys: {
    id: demoIds.logo,
    type: "Asset" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: "Logo",
    file: {
      url: "https://cdn.example.com/logo.svg",
      fileName: "logo.svg",
      contentType: "image/svg+xml",
    },
  },
} satisfies ContentfulAsset;

const demoCmsEntries = new Map<string, ContentfulResolvedEntry>([
  [demoIds.page, pageEntry],
  [demoIds.tabs, tabsEntry],
  [demoIds.tab, tabEntry],
  [demoIds.hero, heroEntry],
  [demoIds.product, productEntry],
  [demoIds.menu, menuEntry],
  [demoIds.footer, footerEntry],
]);

const demoCmsAssets = new Map<string, ContentfulAsset>([[demoIds.logo, logoAsset]]);

/** In-memory CMS fixture store (sys.id → Delivery-like payload). */
export const demoCmsStore: CmsFixtureStore = {
  entries: demoCmsEntries,
  assets: demoCmsAssets,
};
