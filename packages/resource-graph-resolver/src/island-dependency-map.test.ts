import { ari } from "@xndrjs/application-resources";
import { describe, expect, it } from "vitest";

import { IslandDependencyMap } from "./island-dependency-map";

describe("IslandDependencyMap", () => {
  it("records direct edges between distinct islands", () => {
    const deps = new IslandDependencyMap();
    const pageId = ari("page", { id: "P" }).format();
    const menuId = ari("menu", { id: "M" }).format();
    const footerId = ari("footer", { id: "F" }).format();

    deps.add(pageId, menuId);
    deps.add(pageId, footerId);

    expect([...deps.get(pageId)]).toEqual([menuId, footerId]);
    expect(deps.get(menuId).size).toBe(0);
  });

  it("ignores self-edges", () => {
    const deps = new IslandDependencyMap();
    const pageId = ari("page", { id: "P" }).format();

    deps.add(pageId, pageId);

    expect(deps.get(pageId).size).toBe(0);
  });
});
