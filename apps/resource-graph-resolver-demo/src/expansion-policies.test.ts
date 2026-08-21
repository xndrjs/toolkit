import { ContentMap, ResolveContentGraphEngine } from "@xndrjs/resource-graph-resolver";
import { describe, expect, it } from "vitest";

import type { DemoContentRegistry } from "./content-registry.js";
import {
  demoIds,
  demoStore,
  footerEntryAri,
  heroEntryAri,
  logoAssetAri,
  menuEntryAri,
  pageEntryAri,
  productEntryAri,
  tabEntryAri,
  tabsEntryAri,
} from "./demo-content-fixtures.js";
import { createDemoExpansionPort } from "./expansion-policies.js";
import { createInMemoryDataPort } from "./in-memory-data-port.js";
import type { MockContentfulEntry } from "./mock-contentful-types.js";

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

describe("createDemoExpansionPort", () => {
  it("expands page links as opaque entry ARIs (modules + menu + footer)", () => {
    const page = demoStore.get(pageEntryAri.format()) as MockContentfulEntry;
    const result = expandEntry(pageEntryAri, page);

    expect(result.isIsland).toBeUndefined();
    expect(result.resources.map((r) => r.format())).toEqual([
      tabsEntryAri.format(),
      productEntryAri.format(),
      menuEntryAri.format(),
      footerEntryAri.format(),
    ]);
    expect(result.resources.every((r) => r.type === "entry")).toBe(true);
  });

  it("expands polymorphic tab.strips without knowing target content-types", () => {
    const tab = demoStore.get(tabEntryAri.format()) as MockContentfulEntry;
    const result = expandEntry(tabEntryAri, tab);

    expect(result.resources.map((r) => r.format())).toEqual([
      heroEntryAri.format(),
      productEntryAri.format(),
    ]);
    expect(result.resources.every((r) => r.type === "entry")).toBe(true);
  });

  it("marks menu and footer as islands and expands logo assets", () => {
    const menu = demoStore.get(menuEntryAri.format()) as MockContentfulEntry;
    const footer = demoStore.get(footerEntryAri.format()) as MockContentfulEntry;

    const menuResult = expandEntry(menuEntryAri, menu);
    const footerResult = expandEntry(footerEntryAri, footer);

    expect(menuResult.isIsland).toBe(true);
    expect(menuResult.resources.map((r) => r.format())).toEqual([logoAssetAri.format()]);
    expect(menuResult.resources[0]?.type).toBe("asset");

    expect(footerResult.isIsland).toBe(true);
    expect(footerResult.resources.map((r) => r.format())).toEqual([logoAssetAri.format()]);
  });

  it("expands hero image to an opaque asset ARI and leaves product leaf-empty", () => {
    const hero = demoStore.get(heroEntryAri.format()) as MockContentfulEntry;
    const product = demoStore.get(productEntryAri.format()) as MockContentfulEntry;

    expect(expandEntry(heroEntryAri, hero).resources.map((r) => r.format())).toEqual([
      logoAssetAri.format(),
    ]);
    expect(expandEntry(productEntryAri, product).resources).toEqual([]);
  });

  it("returns no children for assets", () => {
    const contentMap = new ContentMap<DemoContentRegistry>();
    const asset = demoStore.get(logoAssetAri.format()) as DemoContentRegistry["asset"];
    contentMap.set(logoAssetAri, asset);

    expect(
      createDemoExpansionPort().expand({
        resource: logoAssetAri,
        contentMap,
        inheritedIslandId: logoAssetAri.format(),
        executionContext: undefined,
      })
    ).toEqual({ resources: [] });
  });

  it("resolves the demo page graph with menu/footer islands and a shared asset", async () => {
    const engine = new ResolveContentGraphEngine(
      createInMemoryDataPort(demoStore),
      createDemoExpansionPort()
    );

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

    // Shared logo stays a single ContentMap key across islands
    expect(output.contentMap.get(logoAssetAri)).toMatchObject({
      sys: { id: demoIds.logo, type: "Asset" },
    });
  });
});
