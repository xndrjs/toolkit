import { assetAri, entryAri } from "./ari.js";
import type { DemoContentRegistry } from "./content-registry.js";
import {
  mockAssetLink,
  mockAssetSys,
  mockEntryLink,
  mockEntrySys,
  type MockContentfulAsset,
} from "./mock-contentful-types.js";

/** Demo resource ids used by the in-memory CMS fixtures. */
export const demoIds = {
  page: "page-home",
  tabs: "tabs-main",
  tab: "tab-1",
  hero: "hero-banner",
  product: "product-widget",
  menu: "menu-main",
  footer: "footer-main",
  logo: "asset-logo",
} as const;

export const pageEntryAri = entryAri(demoIds.page);
export const tabsEntryAri = entryAri(demoIds.tabs);
export const tabEntryAri = entryAri(demoIds.tab);
export const heroEntryAri = entryAri(demoIds.hero);
export const productEntryAri = entryAri(demoIds.product);
export const menuEntryAri = entryAri(demoIds.menu);
export const footerEntryAri = entryAri(demoIds.footer);
export const logoAssetAri = assetAri(demoIds.logo);

/**
 * In-memory CMS-like store keyed by `resource.format()`.
 * Values are MOCK Contentful Delivery payloads with Link stubs.
 */
export const demoStore = new Map<string, DemoContentRegistry[keyof DemoContentRegistry]>([
  [
    pageEntryAri.format(),
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
    tabsEntryAri.format(),
    {
      sys: mockEntrySys(demoIds.tabs, "tabs"),
      fields: {
        title: { "en-US": "Featured", "it-IT": "In evidenza" },
        tabs: [mockEntryLink(demoIds.tab)],
      },
    },
  ],
  [
    tabEntryAri.format(),
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
    heroEntryAri.format(),
    {
      sys: mockEntrySys(demoIds.hero, "hero"),
      fields: {
        title: { "en-US": "Welcome", "it-IT": "Benvenuti" },
        image: mockAssetLink(demoIds.logo),
      },
    },
  ],
  [
    productEntryAri.format(),
    {
      sys: mockEntrySys(demoIds.product, "product"),
      fields: {
        sku: "WIDGET-1",
        title: { "en-US": "Widget", "it-IT": "Widget" },
        description: {
          "en-US": "A demo product from CMS.",
          "it-IT": "Un prodotto demo dal CMS.",
        },
      },
    },
  ],
  [
    menuEntryAri.format(),
    {
      sys: mockEntrySys(demoIds.menu, "menu"),
      fields: {
        title: "Main menu",
        logo: mockAssetLink(demoIds.logo),
      },
    },
  ],
  [
    footerEntryAri.format(),
    {
      sys: mockEntrySys(demoIds.footer, "footer"),
      fields: {
        title: "Footer",
        logo: mockAssetLink(demoIds.logo),
      },
    },
  ],
  [
    logoAssetAri.format(),
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
    } satisfies MockContentfulAsset,
  ],
]);
