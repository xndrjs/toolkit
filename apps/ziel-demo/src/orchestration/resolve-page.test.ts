import { describe, expect, it } from "vitest";

import {
  customReferenceAri,
  entryAri,
  Scalars,
  type PageDetail_Asset,
  type PageDetail_Entry,
  type PageDetail_Entry_Arm3,
  type PageDetail_Entry_Hero,
  type PageDetail_Entry_Page,
  type PageDetail_Entry_Product,
  type PageDetail_Entry_SiteInternalLink,
  type PageDetail_Entry_Tab,
  type PageDetail_Entry_Tabs,
} from "../generated";
import { resolveDemoPageDetail } from "../infrastructure/demo-resolver.js";
import { parseCustomReference } from "../infrastructure/cms/custom-reference.js";
import {
  DEMO_ENVIRONMENT,
  DEMO_LOCALE,
  DEMO_SPACE,
  demoAssets,
  demoHeroWelcomeCustomRef,
  demoIds,
} from "../infrastructure/fixtures/store.js";
import { parseDemoLocaleParam, resolvePage } from "./resolve-page.js";

/** Default arm shares `kind` literals — narrow via a distinctive field. */
function isHero(
  e: PageDetail_Entry | PageDetail_Asset | null | undefined
): e is PageDetail_Entry_Hero {
  return e != null && e.kind === "Hero" && "image" in e;
}

function isTabs(e: PageDetail_Entry | null | undefined): e is PageDetail_Entry_Tabs {
  return e != null && e.kind === "Tabs" && "tabs" in e;
}

function isTab(e: PageDetail_Entry | null | undefined): e is PageDetail_Entry_Tab {
  return e != null && e.kind === "Tab" && "strips" in e;
}

function isProduct(e: PageDetail_Entry | null | undefined): e is PageDetail_Entry_Product {
  return e != null && e.kind === "Product" && "sku" in e;
}

function isLink(e: PageDetail_Entry | null | undefined): e is PageDetail_Entry_SiteInternalLink {
  return e != null && e.kind === "SiteInternalLink" && "target" in e;
}

function isPageEntry(e: PageDetail_Entry | null | undefined): e is PageDetail_Entry_Page {
  return e != null && e.kind === "Page" && "title" in e;
}

function isMenu(e: PageDetail_Entry_Arm3 | null | undefined): e is PageDetail_Entry_Arm3 & {
  kind: "Menu";
} {
  return e != null && e.kind === "Menu";
}

function isFooter(e: PageDetail_Entry_Arm3 | null | undefined): e is PageDetail_Entry_Arm3 & {
  kind: "Footer";
} {
  return e != null && e.kind === "Footer";
}

function isAsset(e: PageDetail_Entry | PageDetail_Asset | null | undefined): e is PageDetail_Asset {
  return e != null && e.kind === "Asset" && "url" in e;
}

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

    expect(isMenu(page.menu)).toBe(true);
    if (!isMenu(page.menu)) {
      return;
    }
    expect(page.menu.id).toBe(demoIds.menu);
    expect(page.menu.logo?.id).toBe(demoIds.assetLogo);

    expect(isFooter(page.footer)).toBe(true);
    if (!isFooter(page.footer)) {
      return;
    }
    expect(page.footer.id).toBe(demoIds.footer);

    // strips: no content-type discriminant in the link — variant from Entry payload.
    expect(page.strips).toHaveLength(4);
    const [tabsStrip, heroStrip, productStrip, linkStrip] = page.strips;

    expect(isTabs(tabsStrip)).toBe(true);
    if (!isTabs(tabsStrip)) {
      return;
    }
    expect(tabsStrip.id).toBe(demoIds.tabs);
    expect(tabsStrip.tabs).toHaveLength(1);

    const nestedTab = tabsStrip.tabs[0]!;
    expect(isTab(nestedTab)).toBe(true);
    if (!isTab(nestedTab)) {
      return;
    }
    expect(nestedTab.id).toBe(demoIds.tabOverview);
    expect(nestedTab.strips).toHaveLength(2);

    const [nestedHero, nestedProduct] = nestedTab.strips;
    expect(isHero(nestedHero)).toBe(true);
    if (isHero(nestedHero)) {
      expect(nestedHero.image?.id).toBe(demoIds.assetHeroNested);
    }
    expect(isProduct(nestedProduct)).toBe(true);
    if (isProduct(nestedProduct)) {
      // page-detail excludes `id` on Product arms
      expect(nestedProduct.sku).toBe("HOODIE-1");
    }

    expect(isHero(heroStrip)).toBe(true);
    if (isHero(heroStrip)) {
      expect(heroStrip.id).toBe(demoIds.heroWelcome);
      expect(heroStrip.image?.id).toBe(demoIds.assetHero);
      expect(heroStrip.image?.url).toContain("hero-welcome");
    }

    expect(isProduct(productStrip)).toBe(true);
    if (isProduct(productStrip)) {
      // page-detail excludes `id` on Product arms
      expect(productStrip.sku).toBe("TSHIRT-1");
      expect(productStrip.title).toBe("Demo T-Shirt");
    }

    // SiteInternalLink → shallow linked Page (id + title — no strips/menu/footer).
    expect(isLink(linkStrip)).toBe(true);
    if (isLink(linkStrip)) {
      expect(linkStrip.id).toBe(demoIds.linkAbout);
      expect(isPageEntry(linkStrip.target)).toBe(true);
      if (isPageEntry(linkStrip.target)) {
        expect(linkStrip.target.id).toBe(demoIds.pageAbout);
        expect(linkStrip.target.title).toBe("About");
      }
      expect(linkStrip.target).not.toHaveProperty("strips");
      expect(linkStrip.target).not.toHaveProperty("menu");
      expect(linkStrip.target).not.toHaveProperty("footer");
    }

    // CustomReference → Entry → Hero / Asset (no wrapper).
    expect(page.related).toHaveLength(2);
    const relatedHero = page.related[0];
    expect(isHero(relatedHero)).toBe(true);
    if (isHero(relatedHero)) {
      expect(relatedHero.id).toBe(demoIds.heroWelcome);
      expect(relatedHero.image?.id).toBe(demoIds.assetHero);
    }
    expect(isAsset(page.related[1])).toBe(true);
    if (isAsset(page.related[1])) {
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

    const fromStrip = result.page.strips.find((s) => isHero(s));
    const fromRelated = result.page.related.find((r) => isHero(r));
    expect(isHero(fromStrip)).toBe(true);
    expect(isHero(fromRelated)).toBe(true);
    if (isHero(fromStrip) && isHero(fromRelated)) {
      expect(fromRelated.id).toBe(fromStrip.id);
      expect(fromRelated.title).toBe(fromStrip.title);
      expect(fromRelated.image?.id).toBe(fromStrip.image?.id);
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

  it("soft-fails missing expand children via on failure set null (no global collect mode)", async () => {
    const assetsWithoutLogo = new Map(demoAssets);
    assetsWithoutLogo.delete(demoIds.assetLogo);

    const output = await resolveDemoPageDetail({
      params: { pageId: Scalars.EntryId(demoIds.page) },
      executionContext: {
        spaceId: DEMO_SPACE,
        environmentId: DEMO_ENVIRONMENT,
        locale: DEMO_LOCALE,
      },
      assets: assetsWithoutLogo,
    });

    expect(output.errors).toEqual([]);
    expect(isMenu(output.pageDetail.menu)).toBe(true);
    if (isMenu(output.pageDetail.menu)) {
      expect(output.pageDetail.menu.logo).toBeNull();
    }
    // Related asset (same logo ARI) is also omitted under set null.
    expect(output.pageDetail.related.some((r) => r === null)).toBe(true);
  });
});
