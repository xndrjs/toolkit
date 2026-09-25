import { describe, expect, it } from "vitest";

import { DEMO_LOCALE, demoIds } from "../infrastructure/fixtures/store.js";
import { parseDemoLocaleParam, resolvePage } from "./resolve-page.js";

describe("resolvePage", () => {
  it("projects the fixture page with $type, aliases, Product, and Asset", async () => {
    const result = await resolvePage({ locale: DEMO_LOCALE });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.meta).toMatchObject({
      locale: DEMO_LOCALE,
      pageId: demoIds.page,
      schedulingMode: "lane",
    });
    expect(result.meta.resolvedCount).toBeGreaterThan(0);

    const { page } = result;
    expect(page.$type).toBe("Page");
    expect(page.id).toBe(demoIds.page);
    expect(page.title).toBe("Homepage");

    expect(page.menu.$type).toBe("Menu");
    expect(page.menu.id).toBe(demoIds.menu);
    expect(page.menu.logo.$type).toBe("Asset");
    expect(page.menu.logo.id).toBe(demoIds.assetLogo);

    expect(page.footer.$type).toBe("Footer");
    expect(page.footer.id).toBe(demoIds.footer);
    expect(page.footer.logo.$type).toBe("Asset");
    expect(page.footer.logo.id).toBe(demoIds.assetLogo);

    expect(page.strips).toHaveLength(3);
    const [tabsStrip, heroStrip, productStrip] = page.strips;

    expect(tabsStrip?.$type).toBe("Tabs");
    if (tabsStrip?.$type !== "Tabs") {
      return;
    }
    expect(tabsStrip.id).toBe(demoIds.tabs);
    expect(tabsStrip.tabs).toHaveLength(1);

    const nestedTab = tabsStrip.tabs[0]!;
    expect(nestedTab.$type).toBe("Tab");
    expect(nestedTab.id).toBe(demoIds.tabOverview);
    expect(nestedTab.strips).toHaveLength(2);

    const [nestedHero, nestedProduct] = nestedTab.strips;
    expect(nestedHero?.$type).toBe("Hero");
    if (nestedHero?.$type === "Hero") {
      expect(nestedHero.image.$type).toBe("Asset");
      expect(nestedHero.image.id).toBe(demoIds.assetHeroNested);
    }
    expect(nestedProduct?.$type).toBe("Product");
    if (nestedProduct?.$type === "Product") {
      expect(nestedProduct.id).toBe(demoIds.productHoodie);
      expect(nestedProduct.sku).toBe("HOODIE-1");
    }

    expect(heroStrip?.$type).toBe("Hero");
    if (heroStrip?.$type === "Hero") {
      expect(heroStrip.id).toBe(demoIds.heroWelcome);
      expect(heroStrip.image.$type).toBe("Asset");
      expect(heroStrip.image.id).toBe(demoIds.assetHero);
      expect(heroStrip.image.url).toContain("hero-welcome");
    }

    expect(productStrip?.$type).toBe("Product");
    if (productStrip?.$type === "Product") {
      expect(productStrip.id).toBe(demoIds.productTshirt);
      expect(productStrip.sku).toBe("TSHIRT-1");
      expect(productStrip.title).toBe("Demo T-Shirt");
    }
  });

  it("maps route locale params onto the fixture locale", () => {
    expect(parseDemoLocaleParam("en")).toBe(DEMO_LOCALE);
    expect(parseDemoLocaleParam("en-US")).toBe(DEMO_LOCALE);
    expect(parseDemoLocaleParam("it")).toBeNull();
  });
});
