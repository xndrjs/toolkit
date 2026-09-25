import { describe, expect, it } from "vitest";

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
} from "../../generated/page-detail.js";
import { DEMO_LOCALE, demoFixtureStore, demoIds } from "../fixtures/store.js";
import { CMS_SOURCE_ID, createCmsSource } from "./data-adapter.js";

const locale = DEMO_LOCALE;
const loadContext = { executionContext: { locale }, batchNumber: 1 };

describe("createCmsSource", () => {
  it("owns the editorial ARI families", () => {
    const source = createCmsSource();
    expect(source.id).toBe(CMS_SOURCE_ID);
    expect(source.for.map((family) => family.type).sort()).toEqual([
      "EditorialModule",
      "Footer",
      "Hero",
      "Menu",
      "Page",
      "Tab",
      "TabCollection",
      "Tabs",
    ]);
  });

  it("returns fixtures for owned families and omits missing keys", async () => {
    const source = createCmsSource();
    const page = pageAri({ id: demoIds.page, locale });
    const hero = heroAri({ id: demoIds.heroWelcome, locale });
    const menu = menuAri({ id: demoIds.menu, locale });
    const footer = footerAri({ id: demoIds.footer, locale });
    const tabs = tabsAri({ id: demoIds.tabs, locale });
    const tab = tabAri({ id: demoIds.tabOverview, locale });
    const tabCollection = tabCollectionAri({ tabsId: demoIds.tabs, locale });
    const editorial = editorialModuleAri({ id: demoIds.heroWelcome, locale });
    const unknownPage = pageAri({ id: "missing-page", locale });

    const records = await source.load(
      [page, hero, menu, footer, tabs, tab, tabCollection, editorial, unknownPage],
      loadContext
    );

    expect(records.map((r) => r.resource.toString()).sort()).toEqual(
      [
        page.toString(),
        hero.toString(),
        menu.toString(),
        footer.toString(),
        tabs.toString(),
        tab.toString(),
        tabCollection.toString(),
        editorial.toString(),
      ].sort()
    );
    expect(records.some((r) => r.resource.toString() === unknownPage.toString())).toBe(false);
  });

  it("does not return catalog or cdn ARIs even when present in the store", async () => {
    const source = createCmsSource(demoFixtureStore);
    const product = productAri({ id: demoIds.productTshirt, locale });
    const asset = assetAri({ id: demoIds.assetLogo, locale });

    const records = await source.load([product, asset], loadContext);
    expect(records).toEqual([]);
  });
});
