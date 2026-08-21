import { ResolveContentGraphEngine } from "@xndrjs/resource-graph-resolver";
import { describe, expect, it } from "vitest";

import { aggregatePageGraph } from "./aggregate-page-graph.js";
import {
  createCmsDataLoader,
  demoCmsStore,
  demoIds,
  logoAssetAri,
  pageEntryAri,
} from "./cms/index.js";
import { createDemoDataGateway } from "./demo-data-gateway.js";
import { AssetShape, PageShape, ProductShape, TabsShape } from "../domain/index.js";
import { createDemoExpansionPort } from "./expansion-policies.js";
import {
  createIntegrationDataLoader,
  demoProductCatalog,
  tshirtIntegrationAri,
  type ProductIntegrationSnapshot,
} from "./integration/index.js";

function createDemoGateway(
  catalog: ReadonlyMap<string, ProductIntegrationSnapshot> = demoProductCatalog
) {
  return createDemoDataGateway(
    createCmsDataLoader(demoCmsStore),
    createIntegrationDataLoader(catalog)
  );
}

async function resolveDemoPage(
  catalog: ReadonlyMap<string, ProductIntegrationSnapshot> = demoProductCatalog
) {
  const engine = new ResolveContentGraphEngine(
    createDemoGateway(catalog),
    createDemoExpansionPort()
  );

  return engine.execute({
    root: pageEntryAri,
    context: undefined,
    missingResourceMode: "throw",
  });
}

describe("aggregatePageGraph", () => {
  it("hydrates the page domain graph and merges product price/stock from ContentMap", async () => {
    const result = await resolveDemoPage();
    expect(result.contentMap.has(tshirtIntegrationAri)).toBe(true);

    const { page } = aggregatePageGraph({
      result,
      root: pageEntryAri,
    });

    expect(PageShape.is(page)).toBe(true);
    expect(page.id).toBe(demoIds.page);
    expect(page.title).toBe("Homepage");
    expect(page.modules).toHaveLength(2);

    const [tabs, productModule] = page.modules;
    expect(TabsShape.is(tabs!)).toBe(true);
    expect(tabs!.type).toBe("Tabs");
    if (productModule?.type !== "Product") {
      throw new Error("expected Product page module");
    }
    expect(productModule.sku).toBe("TSHIRT-1");
    expect(productModule.price.amount).toBe(1999);
    expect(productModule.price.currency).toBe("EUR");
    expect(productModule.availability).toBe(true);

    expect(page.menu?.type).toBe("Menu");
    expect(page.footer?.type).toBe("Footer");
    expect(AssetShape.is(page.menu!.logo)).toBe(true);
    expect(page.menu!.logo.id).toBe(demoIds.logo);
    expect(page.menu!.logo.url).toBe("https://cdn.example.com/logo.svg");
    expect(page.footer!.logo.id).toBe(page.menu!.logo.id);
  });

  it("resolves polymorphic tab strips as Hero | Product", async () => {
    const result = await resolveDemoPage();
    const { page } = aggregatePageGraph({
      result,
      root: pageEntryAri,
    });

    const tabs = page.modules[0]!;
    expect(tabs.type).toBe("Tabs");
    if (tabs.type !== "Tabs") {
      return;
    }

    expect(tabs.tabs).toHaveLength(1);
    const tab = tabs.tabs[0]!;
    expect(tab.strips.map((s) => s.type)).toEqual(["Hero", "Product"]);

    const [hero, product] = tab.strips;
    if (hero?.type !== "Hero") {
      throw new Error("expected Hero strip");
    }
    expect(hero.id).toBe(demoIds.hero);
    expect(hero.image.id).toBe(demoIds.logo);

    expect(ProductShape.is(product!)).toBe(true);
    expect(product!.id).toBe(demoIds.product);
    expect(page.modules[1]?.id).toBe(product!.id);
  });

  it("flattens localized fields for a non-default locale", async () => {
    const result = await resolveDemoPage();
    const { page } = aggregatePageGraph({
      result,
      root: pageEntryAri,
      locale: "it-IT",
    });

    expect(page.title).toBe("Pagina iniziale");
    const product = page.modules[1]!;
    expect(product.type).toBe("Product");
    if (product.type === "Product") {
      expect(product.title).toBe("Maglietta");
      expect(product.description).toBe("Una maglietta demo dal CMS.");
    }
  });

  it("optionally serializes raw CMS islands for invalidation", async () => {
    const result = await resolveDemoPage();
    const { page, serializedIslands } = aggregatePageGraph({
      result,
      root: pageEntryAri,
      includeSerializedIslands: true,
    });

    expect(PageShape.is(page)).toBe(true);
    expect(serializedIslands?.page.islandId).toBe(pageEntryAri.format());
    expect(serializedIslands?.page.completeness).toBe("complete");
    expect(serializedIslands?.page.resources[pageEntryAri.format()]).toBeDefined();
    expect(serializedIslands?.page.resources[tshirtIntegrationAri.format()]).toBeDefined();

    expect(serializedIslands?.menu?.islandId).toMatch(/menu/);
    expect(serializedIslands?.footer?.islandId).toMatch(/footer/);
    expect(serializedIslands?.menu?.resources[logoAssetAri.format()]).toBeDefined();
  });

  it("fails resolve when the integration catalog has no snapshot for the product sku", async () => {
    await expect(resolveDemoPage(new Map())).rejects.toThrow(/Unable to resolve/);
  });

  it("uses the demo product catalog defaults", () => {
    expect(demoProductCatalog.get("TSHIRT-1")).toEqual({
      price: { amount: 1999, currency: "EUR" },
      inStock: true,
    });
  });
});
