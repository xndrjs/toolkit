import {
  assetAri,
  editorialModuleAri,
  footerAri,
  heroAri,
  menuAri,
  pageAri,
  productAri,
  tabAri,
  tabCollectionAri,
  tabsAri,
  type AssetId,
  type AssetPayload,
  type EditorialModuleId,
  type FooterId,
  type FooterPayload,
  type HeroId,
  type HeroPayload,
  type Locale,
  type MenuId,
  type MenuPayload,
  type PageId,
  type PagePayload,
  type ProductId,
  type ProductPayload,
  type Sku,
  type TabCollectionPayload,
  type TabId,
  type TabPayload,
  type TabsId,
  type TabsPayload,
} from "../../generated/page-detail.js";

/** Default locale used by the in-memory fixture graph. */
export const DEMO_LOCALE = "en-US" as Locale;

/** Stable demo resource ids (shared across cms / catalog / cdn keys). */
export const demoIds = {
  page: "page-home",
  menu: "menu-main",
  footer: "footer-main",
  tabs: "tabs-featured",
  tabOverview: "tab-overview",
  heroWelcome: "hero-welcome",
  heroNested: "hero-nested",
  productTshirt: "product-tshirt",
  productHoodie: "product-hoodie",
  assetLogo: "asset-logo",
  assetHero: "asset-hero",
  assetHeroNested: "asset-hero-nested",
} as const;

function pageId(id: string): PageId {
  return id as PageId;
}
function menuId(id: string): MenuId {
  return id as MenuId;
}
function footerId(id: string): FooterId {
  return id as FooterId;
}
function heroId(id: string): HeroId {
  return id as HeroId;
}
function tabsId(id: string): TabsId {
  return id as TabsId;
}
function tabId(id: string): TabId {
  return id as TabId;
}
function productId(id: string): ProductId {
  return id as ProductId;
}
function assetId(id: string): AssetId {
  return id as AssetId;
}
function moduleId(id: string): EditorialModuleId {
  return id as EditorialModuleId;
}
function sku(value: string): Sku {
  return value as Sku;
}

const locale = DEMO_LOCALE;

const pagePayload: PagePayload = {
  id: pageId(demoIds.page),
  title: "Homepage",
  menuId: menuId(demoIds.menu),
  footerId: footerId(demoIds.footer),
  strips: [
    { type: "Tabs", id: moduleId(demoIds.tabs) },
    { type: "Hero", id: moduleId(demoIds.heroWelcome) },
    { type: "Product", id: moduleId(demoIds.productTshirt) },
  ],
};

const menuPayload: MenuPayload = {
  id: menuId(demoIds.menu),
  title: "Main menu",
  logoId: assetId(demoIds.assetLogo),
};

const footerPayload: FooterPayload = {
  id: footerId(demoIds.footer),
  title: "Footer",
  logoId: assetId(demoIds.assetLogo),
};

const heroWelcomePayload: HeroPayload = {
  type: "Hero",
  id: heroId(demoIds.heroWelcome),
  title: "Welcome",
  imageId: assetId(demoIds.assetHero),
};

const heroNestedPayload: HeroPayload = {
  type: "Hero",
  id: heroId(demoIds.heroNested),
  title: "Nested hero",
  imageId: assetId(demoIds.assetHeroNested),
};

const tabsPayload: TabsPayload = {
  type: "Tabs",
  id: tabsId(demoIds.tabs),
  title: "Featured",
};

const tabOverviewPayload: TabPayload = {
  id: tabId(demoIds.tabOverview),
  title: "Overview",
  strips: [
    { type: "Hero", id: moduleId(demoIds.heroNested) },
    { type: "Product", id: moduleId(demoIds.productHoodie) },
  ],
};

const tabCollectionPayload: TabCollectionPayload = [tabOverviewPayload];

const productTshirtPayload: ProductPayload = {
  type: "Product",
  id: productId(demoIds.productTshirt),
  sku: sku("TSHIRT-1"),
  title: "Demo T-Shirt",
};

const productHoodiePayload: ProductPayload = {
  type: "Product",
  id: productId(demoIds.productHoodie),
  sku: sku("HOODIE-1"),
  title: "Demo Hoodie",
};

const assetLogoPayload: AssetPayload = {
  id: assetId(demoIds.assetLogo),
  url: "https://cdn.example.com/logo.svg",
  title: "Logo",
  kind: "image",
};

const assetHeroPayload: AssetPayload = {
  id: assetId(demoIds.assetHero),
  url: "https://cdn.example.com/hero-welcome.jpg",
  title: "Welcome hero",
  kind: "image",
};

const assetHeroNestedPayload: AssetPayload = {
  id: assetId(demoIds.assetHeroNested),
  url: "https://cdn.example.com/hero-nested.jpg",
  title: "Nested hero",
  kind: "image",
};

/**
 * In-memory payloads keyed by `ari.toString()`.
 *
 * Ownership (which DataSource may return the key) follows the Phase 6 split:
 * - cms: Page / Hero / Menu / Footer / Tabs / Tab / TabCollection / EditorialModule
 * - catalog: Product
 * - cdn: Asset
 *
 * EditorialModule keys reuse the concrete Hero / Tabs / Product payloads so
 * union strips project via `$type` discrimination.
 */
export const demoFixtureStore: ReadonlyMap<string, unknown> = new Map<string, unknown>([
  [pageAri({ id: demoIds.page, locale }).toString(), pagePayload],
  [menuAri({ id: demoIds.menu, locale }).toString(), menuPayload],
  [footerAri({ id: demoIds.footer, locale }).toString(), footerPayload],
  [heroAri({ id: demoIds.heroWelcome, locale }).toString(), heroWelcomePayload],
  [heroAri({ id: demoIds.heroNested, locale }).toString(), heroNestedPayload],
  [tabsAri({ id: demoIds.tabs, locale }).toString(), tabsPayload],
  [tabAri({ id: demoIds.tabOverview, locale }).toString(), tabOverviewPayload],
  [tabCollectionAri({ tabsId: demoIds.tabs, locale }).toString(), tabCollectionPayload],
  [editorialModuleAri({ id: demoIds.tabs, locale }).toString(), tabsPayload],
  [editorialModuleAri({ id: demoIds.heroWelcome, locale }).toString(), heroWelcomePayload],
  [editorialModuleAri({ id: demoIds.heroNested, locale }).toString(), heroNestedPayload],
  [editorialModuleAri({ id: demoIds.productTshirt, locale }).toString(), productTshirtPayload],
  [editorialModuleAri({ id: demoIds.productHoodie, locale }).toString(), productHoodiePayload],
  [productAri({ id: demoIds.productTshirt, locale }).toString(), productTshirtPayload],
  [productAri({ id: demoIds.productHoodie, locale }).toString(), productHoodiePayload],
  [assetAri({ id: demoIds.assetLogo, locale }).toString(), assetLogoPayload],
  [assetAri({ id: demoIds.assetHero, locale }).toString(), assetHeroPayload],
  [assetAri({ id: demoIds.assetHeroNested, locale }).toString(), assetHeroNestedPayload],
]);
