import { describe, expect, it } from "vitest";

import { IslandMap } from "./island-map";
import { testAri } from "../testing/test-fixtures.js";

describe("IslandMap", () => {
  it("tracks membership per island using resource.toString()", () => {
    const islands = new IslandMap();
    const page = testAri("page", "P");
    const hero = testAri("hero", "H");
    const asset = testAri("asset", "A");
    const menu = testAri("menu", "M");

    const pageIslandId = page.toString();
    const menuIslandId = menu.toString();

    islands.add(pageIslandId, page);
    islands.add(pageIslandId, hero);
    islands.add(pageIslandId, asset);
    islands.add(menuIslandId, menu);
    islands.add(menuIslandId, asset);

    expect(islands.has(pageIslandId, asset)).toBe(true);
    expect(islands.has(menuIslandId, asset)).toBe(true);
    expect(islands.has(pageIslandId, menu)).toBe(false);

    expect([...islands.get(pageIslandId)]).toEqual([
      page.toString(),
      hero.toString(),
      asset.toString(),
    ]);
    expect([...islands.get(menuIslandId)]).toEqual([menu.toString(), asset.toString()]);
  });

  it("returns an empty set for unknown islands", () => {
    const islands = new IslandMap();

    expect(islands.get(testAri("page", "missing").toString()).size).toBe(0);
  });

  it("lists registered island root ids", () => {
    const islands = new IslandMap();
    const page = testAri("page", "P");
    const menu = testAri("menu", "M");

    islands.add(page.toString(), page);
    islands.add(menu.toString(), menu);

    expect(islands.islandIds()).toEqual([page.toString(), menu.toString()]);
  });
});
