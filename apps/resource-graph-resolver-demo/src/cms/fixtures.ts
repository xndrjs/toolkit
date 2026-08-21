import { cmsAssetAri, cmsEntryAri } from "./ari.js";
import type { CmsFixtureStore } from "./data-adapter.js";
import {
  mockAssetLink,
  mockAssetSys,
  mockEntryLink,
  mockEntrySys,
  type MockContentfulAsset,
  type MockContentfulEntry,
} from "./mock-contentful-types.js";

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

const demoCmsEntries = new Map<string, MockContentfulEntry>([
  [
    demoIds.page,
    {
      sys: mockEntrySys(demoIds.page, "page"),
      fields: {
        title: { "en-US": "Homepage", "it-IT": "Pagina iniziale" },
        modules: [mockEntryLink(demoIds.tabs), mockEntryLink(demoIds.product)],
        menu: mockEntryLink(demoIds.menu),
        footer: mockEntryLink(demoIds.footer),
      },
    },
  ],
  [
    demoIds.tabs,
    {
      sys: mockEntrySys(demoIds.tabs, "tabs"),
      fields: {
        title: { "en-US": "Featured", "it-IT": "In evidenza" },
        tabs: [mockEntryLink(demoIds.tab)],
      },
    },
  ],
  [
    demoIds.tab,
    {
      sys: mockEntrySys(demoIds.tab, "tab"),
      fields: {
        title: { "en-US": "Overview", "it-IT": "Panoramica" },
        // Polymorphic Link array: hero | product (target type unknown until resolve)
        strips: [mockEntryLink(demoIds.hero), mockEntryLink(demoIds.product)],
      },
    },
  ],
  [
    demoIds.hero,
    {
      sys: mockEntrySys(demoIds.hero, "hero"),
      fields: {
        title: { "en-US": "Welcome", "it-IT": "Benvenuti" },
        image: mockAssetLink(demoIds.logo),
      },
    },
  ],
  [
    demoIds.product,
    {
      sys: mockEntrySys(demoIds.product, "product"),
      fields: {
        sku: demoIds.productSku,
        title: { "en-US": "T-Shirt", "it-IT": "Maglietta" },
        description: {
          "en-US": "A demo t-shirt from CMS.",
          "it-IT": "Una maglietta demo dal CMS.",
        },
      },
    },
  ],
  [
    demoIds.menu,
    {
      sys: mockEntrySys(demoIds.menu, "menu"),
      fields: {
        title: "Main menu",
        logo: mockAssetLink(demoIds.logo),
      },
    },
  ],
  [
    demoIds.footer,
    {
      sys: mockEntrySys(demoIds.footer, "footer"),
      fields: {
        title: "Footer",
        logo: mockAssetLink(demoIds.logo),
      },
    },
  ],
]);

const demoCmsAssets = new Map<string, MockContentfulAsset>([
  [
    demoIds.logo,
    {
      sys: mockAssetSys(demoIds.logo),
      fields: {
        title: "Logo",
        file: {
          url: "https://cdn.example.com/logo.svg",
          fileName: "logo.svg",
          contentType: "image/svg+xml",
        },
      },
    },
  ],
]);

/** In-memory CMS fixture store (sys.id → Delivery-like payload). */
export const demoCmsStore: CmsFixtureStore = {
  entries: demoCmsEntries,
  assets: demoCmsAssets,
};
