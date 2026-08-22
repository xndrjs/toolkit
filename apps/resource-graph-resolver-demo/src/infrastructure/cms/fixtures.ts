import { cmsAssetAri, cmsEntryAri } from "./ari.js";
import { CONTENTFUL_DEFAULT_LOCALE } from "./generated/contentful.schemas.js";
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
  tabs: "tabs-featured",
  tabsSecondary: "tabs-secondary",
  tab: "tab-overview",
  tabShop: "tab-shop",
  tabAbout: "tab-about",
  tabPromo: "tab-promo",
  tabNew: "tab-new",
  tabSale: "tab-sale",
  tabBestsellers: "tab-bestsellers",
  hero: "hero-welcome",
  heroPromo: "hero-promo",
  heroSale: "hero-sale",
  heroTeam: "hero-team",
  heroOffice: "hero-office",
  heroValues: "hero-values",
  heroFlash: "hero-flash",
  heroLaunch: "hero-launch",
  heroPreview: "hero-preview",
  heroTeaser: "hero-teaser",
  heroDiscount: "hero-discount",
  product: "product-tshirt",
  productHoodie: "product-hoodie",
  productMug: "product-mug",
  productCap: "product-cap",
  menu: "menu-main",
  footer: "footer-main",
  logo: "asset-logo",
  assetHeroPromo: "asset-hero-promo",
  assetHeroSale: "asset-hero-sale",
  assetHeroTeam: "asset-hero-team",
  assetHeroOffice: "asset-hero-office",
  assetHeroValues: "asset-hero-values",
  assetHeroFlash: "asset-hero-flash",
  assetHeroLaunch: "asset-hero-launch",
  assetHeroPreview: "asset-hero-preview",
  assetHeroTeaser: "asset-hero-teaser",
  assetHeroDiscount: "asset-hero-discount",
  productSku: "TSHIRT-1",
  productSkuHoodie: "HOODIE-1",
  productSkuMug: "MUG-1",
  productSkuCap: "CAP-1",
} as const;

export const pageEntryAri = cmsEntryAri({ id: demoIds.page, locale: CONTENTFUL_DEFAULT_LOCALE });
export const tabsEntryAri = cmsEntryAri({ id: demoIds.tabs, locale: CONTENTFUL_DEFAULT_LOCALE });
export const tabsSecondaryEntryAri = cmsEntryAri({
  id: demoIds.tabsSecondary,
  locale: CONTENTFUL_DEFAULT_LOCALE,
});
export const tabEntryAri = cmsEntryAri({ id: demoIds.tab, locale: CONTENTFUL_DEFAULT_LOCALE });
export const heroEntryAri = cmsEntryAri({ id: demoIds.hero, locale: CONTENTFUL_DEFAULT_LOCALE });
export const productEntryAri = cmsEntryAri({
  id: demoIds.product,
  locale: CONTENTFUL_DEFAULT_LOCALE,
});
export const menuEntryAri = cmsEntryAri({ id: demoIds.menu, locale: CONTENTFUL_DEFAULT_LOCALE });
export const footerEntryAri = cmsEntryAri({
  id: demoIds.footer,
  locale: CONTENTFUL_DEFAULT_LOCALE,
});
export const logoAssetAri = cmsAssetAri({ id: demoIds.logo, locale: CONTENTFUL_DEFAULT_LOCALE });

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
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.tabsSecondary } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.product } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.productHoodie } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.productMug } },
    ],
    menu: { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.menu } },
    footer: { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.footer } },
  },
} satisfies PageEntry;

const tabsFeaturedEntry = {
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
    tabs: [
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.tab } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.tabShop } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.tabAbout } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.tabPromo } },
    ],
  },
} satisfies TabsEntry;

const tabsSecondaryEntry = {
  sys: {
    id: demoIds.tabsSecondary,
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
    title: { "en-US": "More to explore", "it-IT": "Scopri di più" },
    tabs: [
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.tabNew } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.tabSale } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.tabBestsellers } },
    ],
  },
} satisfies TabsEntry;

const tabOverviewEntry = {
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
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.heroPromo } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.product } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.productHoodie } },
    ],
  },
} satisfies TabEntry;

const tabShopEntry = {
  sys: {
    id: demoIds.tabShop,
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
    title: { "en-US": "Shop", "it-IT": "Negozio" },
    strips: [
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.productMug } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.productCap } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.heroSale } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.product } },
    ],
  },
} satisfies TabEntry;

const tabAboutEntry = {
  sys: {
    id: demoIds.tabAbout,
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
    title: { "en-US": "About us", "it-IT": "Chi siamo" },
    strips: [
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.heroTeam } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.heroOffice } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.heroValues } },
    ],
  },
} satisfies TabEntry;

const tabPromoEntry = {
  sys: {
    id: demoIds.tabPromo,
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
    title: { "en-US": "Promotions", "it-IT": "Promozioni" },
    strips: [
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.heroFlash } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.productHoodie } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.productCap } },
    ],
  },
} satisfies TabEntry;

const tabNewEntry = {
  sys: {
    id: demoIds.tabNew,
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
    title: { "en-US": "New arrivals", "it-IT": "Novità" },
    strips: [
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.heroLaunch } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.heroPreview } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.heroTeaser } },
    ],
  },
} satisfies TabEntry;

const tabSaleEntry = {
  sys: {
    id: demoIds.tabSale,
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
    title: { "en-US": "Sale", "it-IT": "Saldi" },
    strips: [
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.product } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.productMug } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.heroDiscount } },
    ],
  },
} satisfies TabEntry;

const tabBestsellersEntry = {
  sys: {
    id: demoIds.tabBestsellers,
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
    title: { "en-US": "Bestsellers", "it-IT": "Più venduti" },
    strips: [
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.product } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.productHoodie } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.productMug } },
      { sys: { type: "Link" as const, linkType: "Entry" as const, id: demoIds.productCap } },
    ],
  },
} satisfies TabEntry;

const heroWelcomeEntry = {
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

const heroPromoEntry = {
  sys: {
    id: demoIds.heroPromo,
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
    title: { "en-US": "Summer promo", "it-IT": "Promo estiva" },
    image: {
      sys: { type: "Link" as const, linkType: "Asset" as const, id: demoIds.assetHeroPromo },
    },
  },
} satisfies HeroEntry;

const heroSaleEntry = {
  sys: {
    id: demoIds.heroSale,
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
    title: { "en-US": "Big sale", "it-IT": "Grandi sconti" },
    image: {
      sys: { type: "Link" as const, linkType: "Asset" as const, id: demoIds.assetHeroSale },
    },
  },
} satisfies HeroEntry;

const heroTeamEntry = {
  sys: {
    id: demoIds.heroTeam,
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
    title: { "en-US": "Our team", "it-IT": "Il nostro team" },
    image: {
      sys: { type: "Link" as const, linkType: "Asset" as const, id: demoIds.assetHeroTeam },
    },
  },
} satisfies HeroEntry;

const heroOfficeEntry = {
  sys: {
    id: demoIds.heroOffice,
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
    title: { "en-US": "Our office", "it-IT": "La nostra sede" },
    image: {
      sys: { type: "Link" as const, linkType: "Asset" as const, id: demoIds.assetHeroOffice },
    },
  },
} satisfies HeroEntry;

const heroValuesEntry = {
  sys: {
    id: demoIds.heroValues,
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
    title: { "en-US": "Our values", "it-IT": "I nostri valori" },
    image: {
      sys: { type: "Link" as const, linkType: "Asset" as const, id: demoIds.assetHeroValues },
    },
  },
} satisfies HeroEntry;

const heroFlashEntry = {
  sys: {
    id: demoIds.heroFlash,
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
    title: { "en-US": "Flash deal", "it-IT": "Offerta lampo" },
    image: {
      sys: { type: "Link" as const, linkType: "Asset" as const, id: demoIds.assetHeroFlash },
    },
  },
} satisfies HeroEntry;

const heroLaunchEntry = {
  sys: {
    id: demoIds.heroLaunch,
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
    title: { "en-US": "Product launch", "it-IT": "Lancio prodotto" },
    image: {
      sys: { type: "Link" as const, linkType: "Asset" as const, id: demoIds.assetHeroLaunch },
    },
  },
} satisfies HeroEntry;

const heroPreviewEntry = {
  sys: {
    id: demoIds.heroPreview,
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
    title: { "en-US": "Sneak peek", "it-IT": "Anteprima" },
    image: {
      sys: { type: "Link" as const, linkType: "Asset" as const, id: demoIds.assetHeroPreview },
    },
  },
} satisfies HeroEntry;

const heroTeaserEntry = {
  sys: {
    id: demoIds.heroTeaser,
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
    title: { "en-US": "Coming soon", "it-IT": "In arrivo" },
    image: {
      sys: { type: "Link" as const, linkType: "Asset" as const, id: demoIds.assetHeroTeaser },
    },
  },
} satisfies HeroEntry;

const heroDiscountEntry = {
  sys: {
    id: demoIds.heroDiscount,
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
    title: { "en-US": "Extra discount", "it-IT": "Sconto extra" },
    image: {
      sys: { type: "Link" as const, linkType: "Asset" as const, id: demoIds.assetHeroDiscount },
    },
  },
} satisfies HeroEntry;

const productTshirtEntry = {
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

const productHoodieEntry = {
  sys: {
    id: demoIds.productHoodie,
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
    sku: demoIds.productSkuHoodie,
    title: { "en-US": "Hoodie", "it-IT": "Felpa" },
    description: {
      "en-US": "A cozy demo hoodie.",
      "it-IT": "Una felpa demo comoda.",
    },
  },
} satisfies ProductEntry;

const productMugEntry = {
  sys: {
    id: demoIds.productMug,
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
    sku: demoIds.productSkuMug,
    title: { "en-US": "Mug", "it-IT": "Tazza" },
    description: {
      "en-US": "A demo mug for your coffee.",
      "it-IT": "Una tazza demo per il caffè.",
    },
  },
} satisfies ProductEntry;

const productCapEntry = {
  sys: {
    id: demoIds.productCap,
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
    sku: demoIds.productSkuCap,
    title: { "en-US": "Cap", "it-IT": "Cappellino" },
    description: {
      "en-US": "A demo cap for sunny days.",
      "it-IT": "Un cappellino demo per le giornate di sole.",
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

const heroPromoAsset = {
  sys: {
    id: demoIds.assetHeroPromo,
    type: "Asset" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: "Summer promo banner",
    file: {
      url: "https://cdn.example.com/hero-promo.jpg",
      fileName: "hero-promo.jpg",
      contentType: "image/jpeg",
    },
  },
} satisfies ContentfulAsset;

const heroSaleAsset = {
  sys: {
    id: demoIds.assetHeroSale,
    type: "Asset" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: "Sale banner",
    file: {
      url: "https://cdn.example.com/hero-sale.jpg",
      fileName: "hero-sale.jpg",
      contentType: "image/jpeg",
    },
  },
} satisfies ContentfulAsset;

const heroTeamAsset = {
  sys: {
    id: demoIds.assetHeroTeam,
    type: "Asset" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: "Team photo",
    file: {
      url: "https://cdn.example.com/hero-team.jpg",
      fileName: "hero-team.jpg",
      contentType: "image/jpeg",
    },
  },
} satisfies ContentfulAsset;

const heroOfficeAsset = {
  sys: {
    id: demoIds.assetHeroOffice,
    type: "Asset" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: "Office photo",
    file: {
      url: "https://cdn.example.com/hero-office.jpg",
      fileName: "hero-office.jpg",
      contentType: "image/jpeg",
    },
  },
} satisfies ContentfulAsset;

const heroValuesAsset = {
  sys: {
    id: demoIds.assetHeroValues,
    type: "Asset" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: "Values illustration",
    file: {
      url: "https://cdn.example.com/hero-values.jpg",
      fileName: "hero-values.jpg",
      contentType: "image/jpeg",
    },
  },
} satisfies ContentfulAsset;

const heroFlashAsset = {
  sys: {
    id: demoIds.assetHeroFlash,
    type: "Asset" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: "Flash deal banner",
    file: {
      url: "https://cdn.example.com/hero-flash.jpg",
      fileName: "hero-flash.jpg",
      contentType: "image/jpeg",
    },
  },
} satisfies ContentfulAsset;

const heroLaunchAsset = {
  sys: {
    id: demoIds.assetHeroLaunch,
    type: "Asset" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: "Launch banner",
    file: {
      url: "https://cdn.example.com/hero-launch.jpg",
      fileName: "hero-launch.jpg",
      contentType: "image/jpeg",
    },
  },
} satisfies ContentfulAsset;

const heroPreviewAsset = {
  sys: {
    id: demoIds.assetHeroPreview,
    type: "Asset" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: "Preview banner",
    file: {
      url: "https://cdn.example.com/hero-preview.jpg",
      fileName: "hero-preview.jpg",
      contentType: "image/jpeg",
    },
  },
} satisfies ContentfulAsset;

const heroTeaserAsset = {
  sys: {
    id: demoIds.assetHeroTeaser,
    type: "Asset" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: "Teaser banner",
    file: {
      url: "https://cdn.example.com/hero-teaser.jpg",
      fileName: "hero-teaser.jpg",
      contentType: "image/jpeg",
    },
  },
} satisfies ContentfulAsset;

const heroDiscountAsset = {
  sys: {
    id: demoIds.assetHeroDiscount,
    type: "Asset" as const,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
    revision: 1,
    space: demoSpace,
    environment: demoEnvironment,
  },
  fields: {
    title: "Discount banner",
    file: {
      url: "https://cdn.example.com/hero-discount.jpg",
      fileName: "hero-discount.jpg",
      contentType: "image/jpeg",
    },
  },
} satisfies ContentfulAsset;

const demoCmsEntries = new Map<string, ContentfulResolvedEntry>([
  [demoIds.page, pageEntry],
  [demoIds.tabs, tabsFeaturedEntry],
  [demoIds.tabsSecondary, tabsSecondaryEntry],
  [demoIds.tab, tabOverviewEntry],
  [demoIds.tabShop, tabShopEntry],
  [demoIds.tabAbout, tabAboutEntry],
  [demoIds.tabPromo, tabPromoEntry],
  [demoIds.tabNew, tabNewEntry],
  [demoIds.tabSale, tabSaleEntry],
  [demoIds.tabBestsellers, tabBestsellersEntry],
  [demoIds.hero, heroWelcomeEntry],
  [demoIds.heroPromo, heroPromoEntry],
  [demoIds.heroSale, heroSaleEntry],
  [demoIds.heroTeam, heroTeamEntry],
  [demoIds.heroOffice, heroOfficeEntry],
  [demoIds.heroValues, heroValuesEntry],
  [demoIds.heroFlash, heroFlashEntry],
  [demoIds.heroLaunch, heroLaunchEntry],
  [demoIds.heroPreview, heroPreviewEntry],
  [demoIds.heroTeaser, heroTeaserEntry],
  [demoIds.heroDiscount, heroDiscountEntry],
  [demoIds.product, productTshirtEntry],
  [demoIds.productHoodie, productHoodieEntry],
  [demoIds.productMug, productMugEntry],
  [demoIds.productCap, productCapEntry],
  [demoIds.menu, menuEntry],
  [demoIds.footer, footerEntry],
]);

const demoCmsAssets = new Map<string, ContentfulAsset>([
  [demoIds.logo, logoAsset],
  [demoIds.assetHeroPromo, heroPromoAsset],
  [demoIds.assetHeroSale, heroSaleAsset],
  [demoIds.assetHeroTeam, heroTeamAsset],
  [demoIds.assetHeroOffice, heroOfficeAsset],
  [demoIds.assetHeroValues, heroValuesAsset],
  [demoIds.assetHeroFlash, heroFlashAsset],
  [demoIds.assetHeroLaunch, heroLaunchAsset],
  [demoIds.assetHeroPreview, heroPreviewAsset],
  [demoIds.assetHeroTeaser, heroTeaserAsset],
  [demoIds.assetHeroDiscount, heroDiscountAsset],
]);

/** In-memory CMS fixture store (sys.id → Delivery-like payload). */
export const demoCmsStore: CmsFixtureStore = {
  entries: demoCmsEntries,
  assets: demoCmsAssets,
};
