import { describe, expect, it } from "vitest";

import { ContentMap } from "../model/content-map";
import { IslandDependencyMap } from "../model/island-dependency-map";
import { IslandMap } from "../model/island-map";
import { serializeAllIslands, serializeIsland } from "./serialize-island";
import { testAri } from "../testing/test-fixtures.js";
import type { ResolveResourceGraphOutput } from "../types";

const page = testAri("page", "P");
const hero = testAri("hero", "H");
const menu = testAri("menu", "M");
const footer = testAri("footer", "F");
const asset = testAri("asset", "A");
const missing = testAri("missing", "X");

function createPageGraphOutput(options?: {
  omitMenu?: boolean;
  missingFromPage?: boolean;
  reverseInsertionOrder?: boolean;
}): ResolveResourceGraphOutput {
  const contentMap = new ContentMap();
  contentMap.set(page, {
    title: "Homepage",
    hero: { $ref: hero.toString() },
    menu: { $ref: menu.toString() },
    footer: { $ref: footer.toString() },
  });
  contentMap.set(hero, { image: { $ref: asset.toString() } });
  if (!options?.omitMenu) {
    contentMap.set(menu, { logo: { $ref: asset.toString() } });
  }
  contentMap.set(footer, { logo: { $ref: asset.toString() } });
  contentMap.set(asset, { url: "https://cdn.example.com/logo.svg" });

  const islands = new IslandMap();
  const pageIslandResources = options?.reverseInsertionOrder
    ? [asset, hero, page]
    : [page, hero, asset];
  for (const resource of pageIslandResources) {
    islands.add(page.toString(), resource);
  }
  if (!options?.omitMenu) {
    const menuIslandResources = options?.reverseInsertionOrder ? [asset, menu] : [menu, asset];
    for (const resource of menuIslandResources) {
      islands.add(menu.toString(), resource);
    }
  }
  const footerIslandResources = options?.reverseInsertionOrder ? [asset, footer] : [footer, asset];
  for (const resource of footerIslandResources) {
    islands.add(footer.toString(), resource);
  }

  const islandDependencies = new IslandDependencyMap();
  if (!options?.omitMenu) {
    if (options?.reverseInsertionOrder) {
      islandDependencies.add(page.toString(), footer.toString());
      islandDependencies.add(page.toString(), menu.toString());
    } else {
      islandDependencies.add(page.toString(), menu.toString());
      islandDependencies.add(page.toString(), footer.toString());
    }
  }
  if (options?.omitMenu) {
    islandDependencies.add(page.toString(), footer.toString());
  }

  return {
    contentMap,
    islands,
    islandDependencies,
    errors: options?.missingFromPage
      ? [
          {
            resourceKey: missing.toString(),
            message: `Unable to resolve ${missing.toString()}`,
            inheritedIslandIds: [page.toString()],
          },
        ]
      : [],
    promotedResourceKeys: [],
  };
}

describe("serializeIsland", () => {
  it("materializes a complete page island without nested island membership", () => {
    const result = createPageGraphOutput();
    const serialized = serializeIsland(page.toString(), result);

    expect(serialized).toEqual({
      schemaVersion: 1,
      islandId: page.toString(),
      completeness: "complete",
      missingResources: [],
      dependencies: [footer.toString(), menu.toString()],
      resources: {
        [page.toString()]: {
          title: "Homepage",
          hero: { $ref: hero.toString() },
          menu: { $ref: menu.toString() },
          footer: { $ref: footer.toString() },
        },
        [hero.toString()]: {
          image: { $ref: asset.toString() },
        },
        [asset.toString()]: {
          url: "https://cdn.example.com/logo.svg",
        },
      },
    });
    expect(serialized.resources[menu.toString()]).toBeUndefined();
    expect(serialized.resources[footer.toString()]).toBeUndefined();
  });

  it("produces stable JSON when IslandMap/Set insertion order is reversed", () => {
    const normal = createPageGraphOutput();
    const reversed = createPageGraphOutput({ reverseInsertionOrder: true });

    const normalSerialized = serializeIsland(page.toString(), normal);
    const reversedSerialized = serializeIsland(page.toString(), reversed);

    // Object property order matters for canonical cache JSON.
    expect(JSON.stringify(reversedSerialized)).toBe(JSON.stringify(normalSerialized));

    expect(Object.keys(reversedSerialized.resources)).toEqual(
      [asset.toString(), hero.toString(), page.toString()].sort()
    );
    expect(reversedSerialized.dependencies).toEqual([footer.toString(), menu.toString()].sort());
  });

  it("serializes a nested island with only its membership", () => {
    const result = createPageGraphOutput();
    const serialized = serializeIsland(menu.toString(), result);

    expect(serialized).toEqual({
      schemaVersion: 1,
      islandId: menu.toString(),
      completeness: "complete",
      missingResources: [],
      dependencies: [],
      resources: {
        [menu.toString()]: {
          logo: { $ref: asset.toString() },
        },
        [asset.toString()]: {
          url: "https://cdn.example.com/logo.svg",
        },
      },
    });
  });

  it("marks islands partial when missing resources were collected for that island", () => {
    const result = createPageGraphOutput({ missingFromPage: true });
    const pageSerialized = serializeIsland(page.toString(), result);
    const menuSerialized = serializeIsland(menu.toString(), result);

    expect(pageSerialized.completeness).toBe("partial");
    expect(pageSerialized.missingResources).toEqual([missing.toString()]);
    expect(menuSerialized.completeness).toBe("complete");
    expect(menuSerialized.missingResources).toEqual([]);
  });

  it("throws when island membership references a resource absent from ContentMap", () => {
    const result = createPageGraphOutput({ omitMenu: true });
    result.islands.add(page.toString(), menu);

    expect(() => serializeIsland(page.toString(), result)).toThrow(
      `Island ${page.toString()} references missing resource ${menu.toString()}`
    );
  });
});

describe("serializeAllIslands", () => {
  it("serializes every registered island in stable islandId order", () => {
    const result = createPageGraphOutput();
    const serialized = serializeAllIslands(result);

    expect(serialized.map((island) => island.islandId)).toEqual(
      [footer.toString(), menu.toString(), page.toString()].sort()
    );
    expect(serialized).toHaveLength(3);
    expect(serialized.every((island) => island.completeness === "complete")).toBe(true);
  });
});
