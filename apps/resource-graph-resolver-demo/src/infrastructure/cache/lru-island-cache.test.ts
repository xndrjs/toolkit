import type { SerializedIsland } from "@xndrjs/resource-graph-resolver";
import { describe, expect, it } from "vitest";

import { loadBackingForRoot } from "./load-backing-for-root.js";
import { DEFAULT_ISLAND_CACHE_TTL_MS, LruIslandCache } from "./lru-island-cache.js";
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

    cache.setIsland(page, DEFAULT_ISLAND_CACHE_TTL_MS);
    expect(cache.getIsland("page")).toEqual(page);
    expect(cache.getIsland("page")).toEqual(page);
    expect(cache.snapshot().entries).toEqual([
      { islandId: "page", expiresAt: expect.any(Number), hitCount: 2 },
    ]);
  });

  it("expires entries after TTL", () => {
    let now = 1_000;
    const cache = new LruIslandCache({ maxSize: 10, now: () => now });

    cache.setIsland(island("page"), 100);
    expect(cache.getIsland("page")).toBeDefined();

    now = 1_100;
    expect(cache.getIsland("page")).toBeUndefined();
    expect(cache.snapshot().size).toBe(0);
  });

  it("evicts least-recently-used when maxSize is exceeded", () => {
    const cache = new LruIslandCache({ maxSize: 2 });

    cache.setIsland(island("a"), DEFAULT_ISLAND_CACHE_TTL_MS);
    cache.setIsland(island("b"), DEFAULT_ISLAND_CACHE_TTL_MS);
    cache.getIsland("a");
    cache.setIsland(island("c"), DEFAULT_ISLAND_CACHE_TTL_MS);

    expect(cache.getIsland("a")).toBeDefined();
    expect(cache.getIsland("b")).toBeUndefined();
    expect(cache.getIsland("c")).toBeDefined();
  });

  it("getIslands preserves input order", () => {
    const cache = new LruIslandCache();
    cache.setIsland(island("menu"), DEFAULT_ISLAND_CACHE_TTL_MS);

    expect(cache.getIslands(["menu", "footer", "menu"])).toEqual([
      expect.objectContaining({ islandId: "menu" }),
      undefined,
      expect.objectContaining({ islandId: "menu" }),
    ]);
  });
});

describe("persistResolvedIslands", () => {
  it("stores only complete islands", () => {
    const cache = new LruIslandCache();

    persistResolvedIslands([island("page", "complete"), island("menu", "partial")], cache);

    expect(cache.getIsland("page")).toBeDefined();
    expect(cache.getIsland("menu")).toBeUndefined();
  });
});

describe("loadBackingForRoot", () => {
  const pageRoot = {
    toString: () => "page",
  } as Parameters<typeof loadBackingForRoot>[0];

  it("returns empty backing on page miss", () => {
    const cache = new LruIslandCache();
    const result = loadBackingForRoot(pageRoot, cache);

    expect(result.report).toEqual({
      pageIsland: "miss",
      islands: [],
      backingResourceCount: 0,
    });
    expect(result.resolvedResourceCache.size).toBe(0);
  });

  it("returns empty backing on incomplete page island", () => {
    const cache = new LruIslandCache();
    cache.setIsland(
      island("page", "partial", { dependencies: ["menu"] }),
      DEFAULT_ISLAND_CACHE_TTL_MS
    );

    const result = loadBackingForRoot(pageRoot, cache);

    expect(result.report.pageIsland).toBe("incomplete");
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
      DEFAULT_ISLAND_CACHE_TTL_MS
    );
    cache.setIsland(
      island("menu", "complete", { resources: { menu: { t: "menu" }, shared: 2 } }),
      DEFAULT_ISLAND_CACHE_TTL_MS
    );
    cache.setIsland(island("footer", "partial"), DEFAULT_ISLAND_CACHE_TTL_MS);

    const result = loadBackingForRoot(pageRoot, cache);

    expect(result.report.pageIsland).toBe("hit");
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
});
