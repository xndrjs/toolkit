import { ResolveContentGraphEngine } from "@xndrjs/resource-graph-resolver";
import { describe, expect, it } from "vitest";

import { mapContentMapToPageAggregate } from "./content-map-to-page-aggregate.mapper.js";
import { createCmsDataLoader, demoCmsStore, demoIds, pageEntryAri } from "../cms/index.js";
import { createDemoDataGateway } from "../demo-data-gateway.js";
import { AssetShape, PageShape, ProductShape, TabsShape } from "../../domain/index.js";
import { createDefaultDemoExecutionContext } from "../demo-execution-context.js";
import { createDemoExpansionPort } from "../expansion-policies.js";
import {
  createIntegrationDataLoader,
  demoProductCatalog,
  tshirtIntegrationAri,
  type ProductIntegrationSnapshot,
} from "../integration/index.js";

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
    executionContext: createDefaultDemoExecutionContext(),
    missingResourceMode: "throw",
  });
}

describe("mapContentMapToPageAggregate", () => {
  it("maps the page domain graph and merges product price/stock from ContentMap", async () => {
    const result = await resolveDemoPage();
    expect(result.contentMap.has(tshirtIntegrationAri)).toBe(true);

    const page = mapContentMapToPageAggregate({
      result,
      root: pageEntryAri,
    });

    expect(PageShape.is(page)).toBe(true);
    expect(page.id).toBe(demoIds.page);
    expect(page.title).toBe("Homepage");
    expect(page.modules).toHaveLength(5);

    const [tabs, tabsSecondary, productModule, hoodieModule, mugModule] = page.modules;
    expect(TabsShape.is(tabs!)).toBe(true);
    expect(tabs!.type).toBe("Tabs");
    expect(TabsShape.is(tabsSecondary!)).toBe(true);
    if (productModule?.type !== "Product") {
      throw new Error("expected Product page module");
    }
    expect(productModule.sku).toBe("TSHIRT-1");
    expect(productModule.price.amount).toBe(1999);
    expect(productModule.price.currency).toBe("EUR");
    expect(productModule.availability).toBe(true);
    expect(hoodieModule?.type).toBe("Product");
    expect(mugModule?.type).toBe("Product");

    expect(page.menu?.type).toBe("Menu");
    expect(page.footer?.type).toBe("Footer");
    expect(AssetShape.is(page.menu!.logo)).toBe(true);
    expect(page.menu!.logo.id).toBe(demoIds.logo);
    expect(page.menu!.logo.url).toBe("https://cdn.example.com/logo.svg");
    expect(page.footer!.logo.id).toBe(page.menu!.logo.id);
  });

  it("resolves polymorphic tab strips as Hero | Product", async () => {
    const result = await resolveDemoPage();
    const page = mapContentMapToPageAggregate({
      result,
      root: pageEntryAri,
    });

    const tabs = page.modules[0]!;
    expect(tabs.type).toBe("Tabs");
    if (tabs.type !== "Tabs") {
      return;
    }

    expect(tabs.tabs).toHaveLength(4);
    const tab = tabs.tabs[0]!;
    expect(tab.strips.map((s) => s.type)).toEqual(["Hero", "Hero", "Product", "Product"]);

    const [hero, heroPromo, product, productHoodie] = tab.strips;
    if (hero?.type !== "Hero") {
      throw new Error("expected Hero strip");
    }
    expect(hero.id).toBe(demoIds.hero);
    expect(hero.image.id).toBe(demoIds.logo);
    expect(heroPromo?.type).toBe("Hero");

    expect(ProductShape.is(product!)).toBe(true);
    expect(product!.id).toBe(demoIds.product);
    expect(ProductShape.is(productHoodie!)).toBe(true);
    expect(page.modules[2]?.id).toBe(product!.id);
  });

  it("flattens localized fields for a non-default locale", async () => {
    const result = await resolveDemoPage();
    const page = mapContentMapToPageAggregate({
      result,
      root: pageEntryAri,
      locale: "it-IT",
    });

    expect(page.title).toBe("Pagina iniziale");
    const product = page.modules[2]!;
    expect(product.type).toBe("Product");
    if (product.type === "Product") {
      expect(product.title).toBe("Maglietta");
      expect(product.description).toBe("Una maglietta demo dal CMS.");
    }
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
