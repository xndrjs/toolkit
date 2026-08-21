import { ari } from "@xndrjs/application-resources";
import { describe, expect, it } from "vitest";

import { ContentMap } from "./content-map";
import { IslandDependencyMap } from "./island-dependency-map";
import { IslandMap } from "./island-map";
import { serializeIsland } from "./serialize-island";
import type { ResolveContentGraphOutput } from "./types";

const page = ari("page", { id: "P" });
const hero = ari("hero", { id: "H" });
const menu = ari("menu", { id: "M" });
const footer = ari("footer", { id: "F" });
const asset = ari("asset", { id: "A" });
const missing = ari("missing", { id: "X" });

function createPageGraphOutput(options?: {
  omitMenu?: boolean;
  missingFromPage?: boolean;
}): ResolveContentGraphOutput {
  const contentMap = new ContentMap();
  contentMap.set(page, {
    title: "Homepage",
    hero: { $ref: hero.format() },
    menu: { $ref: menu.format() },
    footer: { $ref: footer.format() },
  });
  contentMap.set(hero, { image: { $ref: asset.format() } });
  if (!options?.omitMenu) {
    contentMap.set(menu, { logo: { $ref: asset.format() } });
  }
  contentMap.set(footer, { logo: { $ref: asset.format() } });
  contentMap.set(asset, { url: "https://cdn.example.com/logo.svg" });

  const islands = new IslandMap();
  islands.add(page.format(), page);
  islands.add(page.format(), hero);
  islands.add(page.format(), asset);
  if (!options?.omitMenu) {
    islands.add(menu.format(), menu);
    islands.add(menu.format(), asset);
  }
  islands.add(footer.format(), footer);
  islands.add(footer.format(), asset);

  const islandDependencies = new IslandDependencyMap();
  if (!options?.omitMenu) {
    islandDependencies.add(page.format(), menu.format());
  }
  islandDependencies.add(page.format(), footer.format());

  return {
    contentMap,
    islands,
    islandDependencies,
    errors: options?.missingFromPage
      ? [
          {
            resourceKey: missing.format(),
            message: `Unable to resolve ${missing.format()}`,
            inheritedIslandIds: [page.format()],
          },
        ]
      : [],
  };
}

describe("serializeIsland", () => {
  it("materializes a complete page island without nested island membership", () => {
    const result = createPageGraphOutput();
    const serialized = serializeIsland(page.format(), result);

    expect(serialized).toEqual({
      schemaVersion: 1,
      islandId: page.format(),
      completeness: "complete",
      missingResources: [],
      dependencies: [menu.format(), footer.format()],
      resources: {
        [page.format()]: {
          title: "Homepage",
          hero: { $ref: hero.format() },
          menu: { $ref: menu.format() },
          footer: { $ref: footer.format() },
        },
        [hero.format()]: {
          image: { $ref: asset.format() },
        },
        [asset.format()]: {
          url: "https://cdn.example.com/logo.svg",
        },
      },
    });
    expect(serialized.resources[menu.format()]).toBeUndefined();
    expect(serialized.resources[footer.format()]).toBeUndefined();
  });

  it("serializes a nested island with only its membership", () => {
    const result = createPageGraphOutput();
    const serialized = serializeIsland(menu.format(), result);

    expect(serialized).toEqual({
      schemaVersion: 1,
      islandId: menu.format(),
      completeness: "complete",
      missingResources: [],
      dependencies: [],
      resources: {
        [menu.format()]: {
          logo: { $ref: asset.format() },
        },
        [asset.format()]: {
          url: "https://cdn.example.com/logo.svg",
        },
      },
    });
  });

  it("marks islands partial when missing resources were collected for that island", () => {
    const result = createPageGraphOutput({ missingFromPage: true });
    const pageSerialized = serializeIsland(page.format(), result);
    const menuSerialized = serializeIsland(menu.format(), result);

    expect(pageSerialized.completeness).toBe("partial");
    expect(pageSerialized.missingResources).toEqual([missing.format()]);
    expect(menuSerialized.completeness).toBe("complete");
    expect(menuSerialized.missingResources).toEqual([]);
  });

  it("throws when island membership references a resource absent from ContentMap", () => {
    const result = createPageGraphOutput({ omitMenu: true });
    result.islands.add(page.format(), menu);

    expect(() => serializeIsland(page.format(), result)).toThrow(
      `Island ${page.format()} references missing resource ${menu.format()}`
    );
  });
});
