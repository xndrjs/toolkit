import { describe, expect, it } from "vitest";

import { IslandDependencyMap } from "./island-dependency-map";
import { testAri } from "../testing/test-fixtures.js";

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

  it("copies all direct edges into a snapshot", () => {
    const deps = new IslandDependencyMap();
    const pageId = testAri("page", "P").toString();
    const menuId = testAri("menu", "M").toString();
    const footerId = testAri("footer", "F").toString();

    deps.add(pageId, menuId);
    deps.add(pageId, footerId);

    const snapshot = deps.snapshot();

    expect(snapshot.get(pageId)).toEqual(new Set([menuId, footerId]));
    expect(snapshot.get(menuId)).toBeUndefined();
    expect(deps.islandIds()).toEqual([pageId]);
  });

  it("does not leak later edges into an existing snapshot", () => {
    const deps = new IslandDependencyMap();
    const pageId = testAri("page", "P").toString();
    const menuId = testAri("menu", "M").toString();
    const footerId = testAri("footer", "F").toString();

    deps.add(pageId, menuId);
    const snapshot = deps.snapshot();
    deps.add(pageId, footerId);

    expect(snapshot.get(pageId)).toEqual(new Set([menuId]));
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

  it("excludes the starting island from flat dependencies even with cycles", () => {
    const deps = new IslandDependencyMap();
    const a = testAri("island", "A").toString();
    const b = testAri("island", "B").toString();
    const c = testAri("island", "C").toString();

    deps.add(a, b);
    deps.add(b, c);
    deps.add(c, a);

    expect(deps.getFlatDependencies(a)).toEqual([b, c].sort());
    expect(deps.getFlatDependencies(b)).toEqual([a, c].sort());
    expect(deps.getFlatDependencies(c)).toEqual([a, b].sort());
  });

  it("flattens deep island chains without recursion", () => {
    const deps = new IslandDependencyMap();
    const depth = 5_000;
    const ids = Array.from({ length: depth }, (_, index) =>
      testAri("island", String(index)).toString()
    );

    for (let index = 0; index < depth - 1; index++) {
      deps.add(ids[index]!, ids[index + 1]!);
    }

    const flat = deps.getFlatDependencies(ids[0]!);
    expect(flat).toHaveLength(depth - 1);
    expect(flat).not.toContain(ids[0]);
    expect(flat).toContain(ids[depth - 1]);
  });
});
