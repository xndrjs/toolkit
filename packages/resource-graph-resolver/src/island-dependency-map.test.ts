import { describe, expect, it } from "vitest";

import { IslandDependencyMap } from "./island-dependency-map";
import { testAri } from "./test-fixtures.js";

describe("IslandDependencyMap", () => {
  it("records direct edges between distinct islands", () => {
    const deps = new IslandDependencyMap();
    const pageId = testAri("page", "P").toString();
    const menuId = testAri("menu", "M").toString();
    const footerId = testAri("footer", "F").toString();

    deps.add(pageId, menuId);
    deps.add(pageId, footerId);

    expect([...deps.get(pageId)]).toEqual([menuId, footerId]);
    expect(deps.get(menuId).size).toBe(0);
  });

  it("ignores self-edges", () => {
    const deps = new IslandDependencyMap();
    const pageId = testAri("page", "P").toString();

    deps.add(pageId, pageId);

    expect(deps.get(pageId).size).toBe(0);
  });

  it("exposes a dependency map snapshot", () => {
    const deps = new IslandDependencyMap();
    const pageId = testAri("page", "P").toString();
    const menuId = testAri("menu", "M").toString();
    const footerId = testAri("footer", "F").toString();

    deps.add(pageId, menuId);
    deps.add(pageId, footerId);

    expect(deps.dependencyMap.get(pageId)).toEqual(new Set([menuId, footerId]));
    expect(deps.dependencyMap.get(menuId)).toBeUndefined();
  });

  it("returns flat deduplicated transitive dependencies from a root island", () => {
    const deps = new IslandDependencyMap();
    const pageId = testAri("page", "P").toString();
    const menuId = testAri("menu", "M").toString();
    const footerId = testAri("footer", "F").toString();
    const logoId = testAri("logo", "L").toString();

    deps.add(pageId, menuId);
    deps.add(pageId, footerId);
    deps.add(menuId, logoId);
    deps.add(footerId, logoId);

    expect(deps.getFlatDependencies(pageId)).toEqual([footerId, logoId, menuId].sort());
    expect(deps.getFlatDependencies(menuId)).toEqual([logoId]);
  });
});
