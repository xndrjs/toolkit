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
    expect(page.id).toBe(demoIds.page);
    expect(page.title).toBe("Homepage");

    expect(page.menu.kind).toBe("Menu");
    if (page.menu.kind !== "Menu") {
      return;
    }
    expect(page.menu.id).toBe(demoIds.menu);
    expect(page.menu.logo.id).toBe(demoIds.assetLogo);

    expect(page.footer.kind).toBe("Footer");
    if (page.footer.kind !== "Footer") {
      return;
    }
    expect(page.footer.id).toBe(demoIds.footer);

    // strips: no content-type discriminant in the link — variant from Entry payload.
    expect(page.strips).toHaveLength(4);
    const [tabsStrip, heroStrip, productStrip, linkStrip] = page.strips;

    expect(tabsStrip?.kind).toBe("Tabs");
    if (tabsStrip?.kind !== "Tabs") {
      return;
    }
    expect(tabsStrip.id).toBe(demoIds.tabs);
    expect(tabsStrip.tabs).toHaveLength(1);

    const nestedTab = tabsStrip.tabs[0]!;
    expect(nestedTab.kind).toBe("Tab");
    if (nestedTab.kind !== "Tab") {
      return;
    }
    expect(nestedTab.id).toBe(demoIds.tabOverview);
    expect(nestedTab.strips).toHaveLength(2);

    const [nestedHero, nestedProduct] = nestedTab.strips;
    expect(nestedHero?.kind).toBe("Hero");
    if (nestedHero?.kind === "Hero") {
      expect(nestedHero.image.id).toBe(demoIds.assetHeroNested);
    }
    expect(nestedProduct?.kind).toBe("Product");
    if (nestedProduct?.kind === "Product") {
      expect(nestedProduct.id).toBe(demoIds.productHoodie);
      expect(nestedProduct.sku).toBe("HOODIE-1");
    }

    expect(heroStrip?.kind).toBe("Hero");
    if (heroStrip?.kind === "Hero") {
      expect(heroStrip.id).toBe(demoIds.heroWelcome);
      expect(heroStrip.image.id).toBe(demoIds.assetHero);
      expect(heroStrip.image.url).toContain("hero-welcome");
    }

    expect(productStrip?.kind).toBe("Product");
    if (productStrip?.kind === "Product") {
      expect(productStrip.id).toBe(demoIds.productTshirt);
      expect(productStrip.sku).toBe("TSHIRT-1");
      expect(productStrip.title).toBe("Demo T-Shirt");
    }

    // SiteInternalLink → shallow linked Page (id + title — no strips/menu/footer).
    expect(linkStrip?.kind).toBe("SiteInternalLink");
    if (linkStrip?.kind === "SiteInternalLink") {
      expect(linkStrip.id).toBe(demoIds.linkAbout);
      expect(linkStrip.target.kind).toBe("Page");
      expect(linkStrip.target.id).toBe(demoIds.pageAbout);
      if (linkStrip.target.kind === "Page") {
        expect(linkStrip.target.title).toBe("About");
      }
      expect(linkStrip.target).not.toHaveProperty("strips");
      expect(linkStrip.target).not.toHaveProperty("menu");
      expect(linkStrip.target).not.toHaveProperty("footer");
    }

    // CustomReference → Entry → Hero / Asset (no wrapper).
    expect(page.related).toHaveLength(2);
    const relatedHero = page.related[0];
    expect(relatedHero?.kind).toBe("Hero");
    if (relatedHero?.kind === "Hero") {
      expect(relatedHero.id).toBe(demoIds.heroWelcome);
      expect(relatedHero.image.id).toBe(demoIds.assetHero);
    }
    expect(page.related[1]?.kind).toBe("Asset");
    if (page.related[1]?.kind === "Asset") {
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

    const fromStrip = result.page.strips.find((s) => s?.kind === "Hero");
    const fromRelated = result.page.related.find((r) => r?.kind === "Hero");
    expect(fromStrip?.kind).toBe("Hero");
    expect(fromRelated?.kind).toBe("Hero");
    if (fromStrip?.kind === "Hero" && fromRelated?.kind === "Hero") {
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
