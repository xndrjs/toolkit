import { describe, expect, it } from "vitest";

import { ContentMap } from "./content-map";
import { IslandDependencyMap } from "./island-dependency-map";
import { IslandMap } from "./island-map";
import { serializeAllIslands, serializeIsland } from "./serialize-island";
import { testAri } from "./test-fixtures.js";
import type { ResolveContentGraphOutput } from "./types";

const page = testAri("page", "P");
const hero = testAri("hero", "H");
const menu = testAri("menu", "M");
const footer = testAri("footer", "F");
const asset = testAri("asset", "A");
const missing = testAri("missing", "X");

function createPageGraphOutput(options?: {
  omitMenu?: boolean;
  missingFromPage?: boolean;
}): ResolveContentGraphOutput {
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
  islands.add(page.toString(), page);
  islands.add(page.toString(), hero);
  islands.add(page.toString(), asset);
  if (!options?.omitMenu) {
    islands.add(menu.toString(), menu);
    islands.add(menu.toString(), asset);
  }
  islands.add(footer.toString(), footer);
  islands.add(footer.toString(), asset);

  const islandDependencies = new IslandDependencyMap();
  if (!options?.omitMenu) {
    islandDependencies.add(page.toString(), menu.toString());
  }
  islandDependencies.add(page.toString(), footer.toString());

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
      dependencies: [menu.toString(), footer.toString()],
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
