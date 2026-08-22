import { ari } from "@xndrjs/application-resources";
import { describe, expect, it } from "vitest";

import { IslandMap } from "./island-map";

describe("IslandMap", () => {
  it("tracks membership per island using resource.format()", () => {
    const islands = new IslandMap();
    const page = ari("page", { id: "P" });
    const hero = ari("hero", { id: "H" });
    const asset = ari("asset", { id: "A" });
    const menu = ari("menu", { id: "M" });

    const pageIslandId = page.format();
    const menuIslandId = menu.format();

    islands.add(pageIslandId, page);
    islands.add(pageIslandId, hero);
    islands.add(pageIslandId, asset);
    islands.add(menuIslandId, menu);
    islands.add(menuIslandId, asset);

    expect(islands.has(pageIslandId, asset)).toBe(true);
    expect(islands.has(menuIslandId, asset)).toBe(true);
    expect(islands.has(pageIslandId, menu)).toBe(false);

    expect([...islands.get(pageIslandId)]).toEqual([page.format(), hero.format(), asset.format()]);
    expect([...islands.get(menuIslandId)]).toEqual([menu.format(), asset.format()]);
  });

  it("returns an empty set for unknown islands", () => {
    const islands = new IslandMap();

    expect(islands.get(ari("page", { id: "missing" }).format()).size).toBe(0);
  });

  it("lists registered island root ids", () => {
    const islands = new IslandMap();
    const page = ari("page", { id: "P" });
    const menu = ari("menu", { id: "M" });

    islands.add(page.format(), page);
    islands.add(menu.format(), menu);

    expect(islands.islandIds()).toEqual([page.format(), menu.format()]);
  });
});
