import type { SerializedIsland } from "@xndrjs/resource-graph-resolver";
import { describe, expect, it } from "vitest";

import { loadBackingForRoot } from "./load-backing-for-root.js";
import {
  DEFAULT_DEPENDENCY_ISLAND_TTL_MS,
  DEFAULT_DEPENDENCY_MANIFEST_TTL_MS,
  DEFAULT_PAGE_ISLAND_TTL_MS,
  LruIslandCache,
} from "./lru-island-cache.js";
import { persistResolvedIslands } from "./persist-resolved-islands.js";

function island(
  islandId: string,
  completeness: SerializedIsland["completeness"] = "complete",
  options: {
    resources?: Record<string, unknown>;
    dependencies?: string[];
  } = {}
): SerializedIsland {
  return {
    schemaVersion: 1,
    islandId,
    completeness,
    missingResources: completeness === "partial" ? ["missing"] : [],
    dependencies: options.dependencies ?? [],
    resources: options.resources ?? { [islandId]: { id: islandId } },
  };
}

describe("LruIslandCache", () => {
  it("returns stored islands and increments hitCount on get", () => {
    const cache = new LruIslandCache({ maxSize: 10 });
    const page = island("page");

    cache.setIsland(page, DEFAULT_PAGE_ISLAND_TTL_MS, "page");
    expect(cache.getIsland("page")).toEqual(page);
    expect(cache.getIsland("page")).toEqual(page);

    const snapshot = cache.snapshot();
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]).toMatchObject({
      kind: "island",
      islandId: "page",
      tier: "page",
      hitCount: 2,
      island: page,
    });
  });

  it("expires entries after TTL", () => {
    let now = 1_000;
    const cache = new LruIslandCache({ maxSize: 10, now: () => now });

    cache.setIsland(island("page"), 100, "page");
    expect(cache.getIsland("page")).toBeDefined();

    now = 1_100;
    expect(cache.getIsland("page")).toBeUndefined();
    expect(cache.snapshot().size).toBe(0);
  });

  it("stores and returns dependency manifests independently from islands", () => {
    let now = 0;
    const cache = new LruIslandCache({ now: () => now });

    cache.setIsland(island("page"), DEFAULT_PAGE_ISLAND_TTL_MS, "page");
    cache.setDependencyManifest(
      { schemaVersion: 1, islandId: "page", dependencies: ["menu", "footer"] },
      DEFAULT_DEPENDENCY_MANIFEST_TTL_MS
    );

    now = DEFAULT_PAGE_ISLAND_TTL_MS + 1;
    expect(cache.getIsland("page")).toBeUndefined();
    expect(cache.getDependencyManifest("page")).toEqual({
      schemaVersion: 1,
      islandId: "page",
      dependencies: ["menu", "footer"],
    });

    const snapshot = cache.snapshot();
    expect(snapshot.entries.some((entry) => entry.kind === "manifest")).toBe(true);
  });

  it("evicts least-recently-used when maxSize is exceeded", () => {
    const cache = new LruIslandCache({ maxSize: 2 });

    cache.setIsland(island("a"), DEFAULT_PAGE_ISLAND_TTL_MS, "dependency");
    cache.setIsland(island("b"), DEFAULT_PAGE_ISLAND_TTL_MS, "dependency");
    cache.getIsland("a");
    cache.setIsland(island("c"), DEFAULT_PAGE_ISLAND_TTL_MS, "dependency");

    expect(cache.getIsland("a")).toBeDefined();
    expect(cache.getIsland("b")).toBeUndefined();
    expect(cache.getIsland("c")).toBeDefined();
  });

  it("getIslands preserves input order", () => {
    const cache = new LruIslandCache();
    cache.setIsland(island("menu"), DEFAULT_DEPENDENCY_ISLAND_TTL_MS, "dependency");

    expect(cache.getIslands(["menu", "footer", "menu"])).toEqual([
      expect.objectContaining({ islandId: "menu" }),
      undefined,
      expect.objectContaining({ islandId: "menu" }),
    ]);
  });
});

describe("persistResolvedIslands", () => {
  it("stores only complete islands with tiered TTL", () => {
    let now = 0;
    const cache = new LruIslandCache({ now: () => now });

    persistResolvedIslands(
      [island("page", "complete", { dependencies: ["menu"] }), island("menu", "partial")],
      cache,
      { rootIslandId: "page" }
    );

    expect(cache.getIsland("page")).toBeDefined();
    expect(cache.getIsland("menu")).toBeUndefined();
    expect(cache.getDependencyManifest("page")).toEqual({
      schemaVersion: 1,
      islandId: "page",
      dependencies: ["menu"],
    });

    now = DEFAULT_PAGE_ISLAND_TTL_MS + 1;
    expect(cache.getIsland("page")).toBeUndefined();
    expect(cache.getDependencyManifest("page")).toBeDefined();
  });

  it("uses long TTL for non-root dependency islands", () => {
    let now = 0;
    const cache = new LruIslandCache({ now: () => now });

    persistResolvedIslands(
      [
        island("page", "complete", { dependencies: ["menu"] }),
        island("menu", "complete", { resources: { menu: { t: "menu" } } }),
      ],
      cache,
      { rootIslandId: "page" }
    );

    now = DEFAULT_PAGE_ISLAND_TTL_MS + 1;
    expect(cache.getIsland("page")).toBeUndefined();
    expect(cache.getIsland("menu")).toBeDefined();
  });
});

describe("loadBackingForRoot", () => {
  const pageRoot = {
    toString: () => "page",
  } as Parameters<typeof loadBackingForRoot>[0];

  it("returns empty backing on page and manifest miss", () => {
    const cache = new LruIslandCache();
    const result = loadBackingForRoot(pageRoot, cache);

    expect(result.report).toEqual({
      pageIsland: "miss",
      dependencyManifest: "miss",
      islands: [],
      backingResourceCount: 0,
    });
    expect(result.resolvedResourceCache.size).toBe(0);
  });

  it("returns empty backing on incomplete page island without manifest fallback", () => {
    const cache = new LruIslandCache();
    cache.setIsland(
      island("page", "partial", { dependencies: ["menu"] }),
      DEFAULT_PAGE_ISLAND_TTL_MS,
      "page"
    );

    const result = loadBackingForRoot(pageRoot, cache);

    expect(result.report.pageIsland).toBe("incomplete");
    expect(result.report.dependencyManifest).toBe("miss");
    expect(result.report.islands).toEqual([]);
    expect(result.resolvedResourceCache.size).toBe(0);
  });

  it("merges complete page + dependency islands into backing", () => {
    const cache = new LruIslandCache();
    cache.setIsland(
      island("page", "complete", {
        dependencies: ["menu", "footer"],
        resources: { page: { t: "page" }, shared: 1 },
      }),
      DEFAULT_PAGE_ISLAND_TTL_MS,
      "page"
    );
    cache.setIsland(
      island("menu", "complete", { resources: { menu: { t: "menu" }, shared: 2 } }),
      DEFAULT_DEPENDENCY_ISLAND_TTL_MS,
      "dependency"
    );
    cache.setIsland(island("footer", "partial"), DEFAULT_DEPENDENCY_ISLAND_TTL_MS, "dependency");

    const result = loadBackingForRoot(pageRoot, cache);

    expect(result.report.pageIsland).toBe("hit");
    expect(result.report.dependencyManifest).toBe("hit");
    expect(result.report.islands).toEqual([
      { islandId: "menu", status: "hit" },
      { islandId: "footer", status: "incomplete" },
    ]);
    expect(result.resolvedResourceCache.get("page")).toEqual({ t: "page" });
    expect(result.resolvedResourceCache.get("menu")).toEqual({ t: "menu" });
    expect(result.resolvedResourceCache.get("shared")).toBe(2);
    expect(result.resolvedResourceCache.has("footer")).toBe(false);
    expect(result.report.backingResourceCount).toBe(result.resolvedResourceCache.size);
  });

  it("loads dependency islands from manifest when page island expired", () => {
    let now = 0;
    const cache = new LruIslandCache({ now: () => now });

    persistResolvedIslands(
      [
        island("page", "complete", {
          dependencies: ["menu"],
          resources: { page: { t: "page" } },
        }),
        island("menu", "complete", { resources: { menu: { t: "menu" } } }),
      ],
      cache,
      { rootIslandId: "page" }
    );

    now = DEFAULT_PAGE_ISLAND_TTL_MS + 1;

    const result = loadBackingForRoot(pageRoot, cache);

    expect(result.report.pageIsland).toBe("miss");
    expect(result.report.dependencyManifest).toBe("hit");
    expect(result.report.islands).toEqual([{ islandId: "menu", status: "hit" }]);
    expect(result.resolvedResourceCache.has("page")).toBe(false);
    expect(result.resolvedResourceCache.get("menu")).toEqual({ t: "menu" });
    expect(result.report.backingResourceCount).toBe(1);
  });
});
