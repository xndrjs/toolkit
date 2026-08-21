import { ContentMap, ResolveContentGraphEngine } from "@xndrjs/resource-graph-resolver";
import { describe, expect, it } from "vitest";

import {
  createCmsDataLoader,
  demoCmsStore,
  demoIds,
  footerEntryAri,
  heroEntryAri,
  logoAssetAri,
  menuEntryAri,
  pageEntryAri,
  productEntryAri,
  tabEntryAri,
  tabsEntryAri,
  type MockContentfulEntry,
} from "./cms/index.js";
import type { DemoContentRegistry } from "./content-registry.js";
import { createDemoDataGateway } from "./demo-data-gateway.js";
import { createDemoExpansionPort } from "./expansion-policies.js";
import { createIntegrationDataLoader, tshirtIntegrationAri } from "./integration/index.js";

function expandEntry(resource: typeof pageEntryAri, entry: MockContentfulEntry) {
  const contentMap = new ContentMap<DemoContentRegistry>();
  contentMap.set(resource, entry);
  return createDemoExpansionPort().expand({
    resource,
    contentMap,
    inheritedIslandId: resource.format(),
    executionContext: undefined,
  });
}

function createDemoGateway() {
  return createDemoDataGateway(createCmsDataLoader(demoCmsStore), createIntegrationDataLoader());
}

describe("createDemoExpansionPort", () => {
  it("expands page links as opaque cms.entry ARIs (modules + menu + footer)", () => {
    const page = demoCmsStore.entries.get(demoIds.page)!;
    const result = expandEntry(pageEntryAri, page);

    expect(result.isIsland).toBeUndefined();
    expect(result.resources.map((r) => r.format())).toEqual([
      tabsEntryAri.format(),
      productEntryAri.format(),
      menuEntryAri.format(),
      footerEntryAri.format(),
    ]);
    expect(result.resources.every((r) => r.type === "cms.entry")).toBe(true);
  });

  it("expands polymorphic tab.strips without knowing target content-types", () => {
    const tab = demoCmsStore.entries.get(demoIds.tab)!;
    const result = expandEntry(tabEntryAri, tab);

    expect(result.resources.map((r) => r.format())).toEqual([
      heroEntryAri.format(),
      productEntryAri.format(),
    ]);
    expect(result.resources.every((r) => r.type === "cms.entry")).toBe(true);
  });

  it("marks menu and footer as islands and expands logo assets", () => {
    const menu = demoCmsStore.entries.get(demoIds.menu)!;
    const footer = demoCmsStore.entries.get(demoIds.footer)!;

    const menuResult = expandEntry(menuEntryAri, menu);
    const footerResult = expandEntry(footerEntryAri, footer);

    expect(menuResult.isIsland).toBe(true);
    expect(menuResult.resources.map((r) => r.format())).toEqual([logoAssetAri.format()]);
    expect(menuResult.resources[0]?.type).toBe("cms.asset");

    expect(footerResult.isIsland).toBe(true);
    expect(footerResult.resources.map((r) => r.format())).toEqual([logoAssetAri.format()]);
  });

  it("expands hero image to cms.asset and product to integration.product", () => {
    const hero = demoCmsStore.entries.get(demoIds.hero)!;
    const product = demoCmsStore.entries.get(demoIds.product)!;

    expect(expandEntry(heroEntryAri, hero).resources.map((r) => r.format())).toEqual([
      logoAssetAri.format(),
    ]);
    expect(expandEntry(productEntryAri, product).resources.map((r) => r.format())).toEqual([
      tshirtIntegrationAri.format(),
    ]);
    expect(expandEntry(productEntryAri, product).resources[0]?.type).toBe("integration.product");
  });

  it("returns no children for assets and integration products", () => {
    const contentMap = new ContentMap<DemoContentRegistry>();
    const asset = demoCmsStore.assets.get(demoIds.logo)!;
    contentMap.set(logoAssetAri, asset);
    contentMap.set(tshirtIntegrationAri, {
      price: { amount: 1999, currency: "EUR" },
      inStock: true,
    });

    expect(
      createDemoExpansionPort().expand({
        resource: logoAssetAri,
        contentMap,
        inheritedIslandId: logoAssetAri.format(),
        executionContext: undefined,
      })
    ).toEqual({ resources: [] });

    expect(
      createDemoExpansionPort().expand({
        resource: tshirtIntegrationAri,
        contentMap,
        inheritedIslandId: tshirtIntegrationAri.format(),
        executionContext: undefined,
      })
    ).toEqual({ resources: [] });
  });

  it("resolves the demo page graph with menu/footer islands, shared asset, and integration product", async () => {
    const engine = new ResolveContentGraphEngine(createDemoGateway(), createDemoExpansionPort());

    const output = await engine.execute({
      root: pageEntryAri,
      context: undefined,
      missingResourceMode: "throw",
    });

    expect(output.contentMap.has(pageEntryAri)).toBe(true);
    expect(output.contentMap.has(tabsEntryAri)).toBe(true);
    expect(output.contentMap.has(tabEntryAri)).toBe(true);
    expect(output.contentMap.has(heroEntryAri)).toBe(true);
    expect(output.contentMap.has(productEntryAri)).toBe(true);
    expect(output.contentMap.has(tshirtIntegrationAri)).toBe(true);
    expect(output.contentMap.has(menuEntryAri)).toBe(true);
    expect(output.contentMap.has(footerEntryAri)).toBe(true);
    expect(output.contentMap.has(logoAssetAri)).toBe(true);

    expect(output.islands.get(pageEntryAri.format())).toEqual(
      new Set([
        pageEntryAri.format(),
        tabsEntryAri.format(),
        productEntryAri.format(),
        tabEntryAri.format(),
        heroEntryAri.format(),
        logoAssetAri.format(),
        tshirtIntegrationAri.format(),
      ])
    );
    expect(output.islands.get(menuEntryAri.format())).toEqual(
      new Set([menuEntryAri.format(), logoAssetAri.format()])
    );
    expect(output.islands.get(footerEntryAri.format())).toEqual(
      new Set([footerEntryAri.format(), logoAssetAri.format()])
    );

    expect(output.islandDependencies.get(pageEntryAri.format())).toEqual(
      new Set([menuEntryAri.format(), footerEntryAri.format()])
    );
    expect(output.errors).toEqual([]);

    expect(output.contentMap.get(logoAssetAri)).toMatchObject({
      sys: { id: demoIds.logo, type: "Asset" },
    });
    expect(output.contentMap.get(tshirtIntegrationAri)).toEqual({
      price: { amount: 1999, currency: "EUR" },
      inStock: true,
    });
  });
});
