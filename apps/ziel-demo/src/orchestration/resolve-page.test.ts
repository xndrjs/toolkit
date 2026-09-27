import { describe, expect, it } from "vitest";

import { customReferenceAri, entryAri } from "../generated";
import { parseCustomReference } from "../infrastructure/cms/custom-reference.js";
import {
  DEMO_ENVIRONMENT,
  DEMO_LOCALE,
  DEMO_SPACE,
  demoHeroWelcomeCustomRef,
  demoIds,
} from "../infrastructure/fixtures/store.js";
import { parseDemoLocaleParam, resolvePage } from "./resolve-page.js";

describe("resolvePage", () => {
  it("projects the fixture page with Entry variants and Assets", async () => {
    const result = await resolvePage({ locale: DEMO_LOCALE });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.meta).toMatchObject({
      locale: DEMO_LOCALE,
      pageId: demoIds.page,
      spaceId: DEMO_SPACE,
      environmentId: DEMO_ENVIRONMENT,
      schedulingMode: "lane",
    });
    expect(result.meta.resolvedCount).toBeGreaterThan(0);

    const { page } = result;
    expect(page.$type).toBe("Page");
    expect(page.id).toBe(demoIds.page);
    expect(page.title).toBe("Homepage");

    expect(page.menu.$type).toBe("Entry");
    expect(page.menu.type).toBe("Menu");
    if (page.menu.type !== "Menu") {
      return;
    }
    expect(page.menu.id).toBe(demoIds.menu);
    expect(page.menu.logo.$type).toBe("Asset");
    expect(page.menu.logo.id).toBe(demoIds.assetLogo);

    expect(page.footer.$type).toBe("Entry");
    expect(page.footer.type).toBe("Footer");
    if (page.footer.type !== "Footer") {
      return;
    }
    expect(page.footer.id).toBe(demoIds.footer);
    expect(page.footer.logo.$type).toBe("Asset");
    expect(page.footer.logo.id).toBe(demoIds.assetLogo);

    // strips: no content-type discriminant in the link — variant from Entry payload.
    expect(page.strips).toHaveLength(4);
    const [tabsStrip, heroStrip, productStrip, linkStrip] = page.strips;

    expect(tabsStrip?.$type).toBe("Entry");
    expect(tabsStrip?.type).toBe("Tabs");
    if (tabsStrip?.type !== "Tabs") {
      return;
    }
    expect(tabsStrip.id).toBe(demoIds.tabs);
    expect(tabsStrip.tabs).toHaveLength(1);

    const nestedTab = tabsStrip.tabs[0]!;
    expect(nestedTab.$type).toBe("Entry");
    expect(nestedTab.type).toBe("Tab");
    if (nestedTab.type !== "Tab") {
      return;
    }
    expect(nestedTab.id).toBe(demoIds.tabOverview);
    expect(nestedTab.strips).toHaveLength(2);

    const [nestedHero, nestedProduct] = nestedTab.strips;
    expect(nestedHero?.$type).toBe("Entry");
    expect(nestedHero?.type).toBe("Hero");
    if (nestedHero?.type === "Hero") {
      expect(nestedHero.image.$type).toBe("Asset");
      expect(nestedHero.image.id).toBe(demoIds.assetHeroNested);
    }
    expect(nestedProduct?.$type).toBe("Entry");
    expect(nestedProduct?.type).toBe("Product");
    if (nestedProduct?.type === "Product") {
      expect(nestedProduct.id).toBe(demoIds.productHoodie);
      expect(nestedProduct.sku).toBe("HOODIE-1");
    }

    expect(heroStrip?.$type).toBe("Entry");
    expect(heroStrip?.type).toBe("Hero");
    if (heroStrip?.type === "Hero") {
      expect(heroStrip.id).toBe(demoIds.heroWelcome);
      expect(heroStrip.image.$type).toBe("Asset");
      expect(heroStrip.image.id).toBe(demoIds.assetHero);
      expect(heroStrip.image.url).toContain("hero-welcome");
    }

    expect(productStrip?.$type).toBe("Entry");
    expect(productStrip?.type).toBe("Product");
    if (productStrip?.type === "Product") {
      expect(productStrip.id).toBe(demoIds.productTshirt);
      expect(productStrip.sku).toBe("TSHIRT-1");
      expect(productStrip.title).toBe("Demo T-Shirt");
    }

    // SiteInternalLink → shallow linked Page (id + title — no strips/menu/footer).
    expect(linkStrip?.$type).toBe("Entry");
    expect(linkStrip?.type).toBe("SiteInternalLink");
    if (linkStrip?.type === "SiteInternalLink") {
      expect(linkStrip.id).toBe(demoIds.linkAbout);
      expect(linkStrip.target.$type).toBe("Entry");
      expect(linkStrip.target.type).toBe("Page");
      expect(linkStrip.target.id).toBe(demoIds.pageAbout);
      if (linkStrip.target.type === "Page") {
        expect(linkStrip.target.title).toBe("About");
      }
      expect(linkStrip.target).not.toHaveProperty("strips");
      expect(linkStrip.target).not.toHaveProperty("menu");
      expect(linkStrip.target).not.toHaveProperty("footer");
    }

    // CustomReference → Entry → Hero / Asset (no wrapper).
    expect(page.related).toHaveLength(2);
    const relatedHero = page.related[0];
    expect(relatedHero?.$type).toBe("Entry");
    if (relatedHero?.$type === "Entry") {
      expect(relatedHero.type).toBe("Hero");
      if (relatedHero.type === "Hero") {
        expect(relatedHero.id).toBe(demoIds.heroWelcome);
        expect(relatedHero.image.$type).toBe("Asset");
      }
    }
    expect(page.related[1]?.$type).toBe("Asset");
    if (page.related[1]?.$type === "Asset") {
      expect(page.related[1].id).toBe(demoIds.assetLogo);
      expect(page.related[1].url).toContain("logo.svg");
    }
  });

  it("converges standard Entry link and CustomReference onto the same Hero", async () => {
    const result = await resolvePage({ locale: DEMO_LOCALE });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const fromStrip = result.page.strips.find((s) => s?.type === "Hero");
    const fromRelated = result.page.related.find((r) => r?.$type === "Entry" && r.type === "Hero");
    expect(fromStrip?.type).toBe("Hero");
    expect(fromRelated?.$type).toBe("Entry");
    if (
      fromStrip?.type === "Hero" &&
      fromRelated?.$type === "Entry" &&
      fromRelated.type === "Hero"
    ) {
      expect(fromRelated.id).toBe(fromStrip.id);
      expect(fromRelated.title).toBe(fromStrip.title);
      expect(fromRelated.image.id).toBe(fromStrip.image.id);
    }

    const entry = entryAri({
      spaceId: DEMO_SPACE,
      environmentId: DEMO_ENVIRONMENT,
      id: demoIds.heroWelcome,
      locale: DEMO_LOCALE,
    });
    const customRef = customReferenceAri({
      ref: demoHeroWelcomeCustomRef,
      locale: DEMO_LOCALE,
    });
    expect(parseCustomReference(demoHeroWelcomeCustomRef)).toEqual({
      environmentId: DEMO_ENVIRONMENT,
      spaceId: DEMO_SPACE,
      kind: "ENTRY",
      id: demoIds.heroWelcome,
    });
    expect(customRef.toString()).not.toBe(entry.toString());
  });

  it("maps route locale params onto the fixture locale", () => {
    expect(parseDemoLocaleParam("en")).toBe(DEMO_LOCALE);
    expect(parseDemoLocaleParam("en-US")).toBe(DEMO_LOCALE);
    expect(parseDemoLocaleParam("it")).toBeNull();
  });
});
