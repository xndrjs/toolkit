import { serializeAllIslands, type ResolutionObserver } from "@xndrjs/resource-graph-resolver";
import { describe, expect, it } from "vitest";

import { cmsEntryAri, demoIds } from "../cms/index.js";
import { createDefaultDemoExecutionContext } from "../demo-execution-context.js";
import { createDemoResolver } from "../demo-resolver.js";
import { loadBackingForRoot } from "./load-backing-for-root.js";
import { DEFAULT_PAGE_ISLAND_TTL_MS, LruIslandCache } from "./lru-island-cache.js";
import { persistResolvedIslands } from "./persist-resolved-islands.js";

/** Counts resources the sources actually had to fetch, straight off the observer. */
function createLoadCounter(): { observer: ResolutionObserver; loadedResourceCount: () => number } {
  let loadedResourceCount = 0;

  return {
    loadedResourceCount: () => loadedResourceCount,
    observer: {
      onBatchEnd({ resolvedCount }) {
        loadedResourceCount += resolvedCount;
      },
    },
  };
}

async function resolveWithCache(cache: LruIslandCache): Promise<{
  rootIslandStatus: string;
  dependencyManifestStatus: string;
  backingResourceCount: number;
  promotedResourceCount: number;
  loadedResourceCount: number;
}> {
  const executionContext = createDefaultDemoExecutionContext();
  const pageRoot = cmsEntryAri({ id: demoIds.page, locale: executionContext.locale });
  const counter = createLoadCounter();
  const resolver = createDemoResolver({ schedulingMode: "barrier", observer: counter.observer });

  const { backingResources, report } = loadBackingForRoot(pageRoot, cache);

  const output = await resolver.resolve({
    root: pageRoot,
    executionContext,
    missingResourceMode: "throw",
    backingResources,
  });

  expect(output.errors).toEqual([]);

  persistResolvedIslands(serializeAllIslands(output), cache, {
    rootIslandId: pageRoot.toString(),
    islandDependencies: output.islandDependencies,
  });

  return {
    rootIslandStatus: report.rootIslandStatus,
    dependencyManifestStatus: report.dependencyManifest,
    backingResourceCount: report.backingResourceCount,
    promotedResourceCount: output.promotedResourceKeys.length,
    loadedResourceCount: counter.loadedResourceCount(),
  };
}

describe("island cache cold/warm round-trip", () => {
  it("cold resolve persists islands; warm resolve hits page backing with few/zero loads", async () => {
    const cache = new LruIslandCache();

    const cold = await resolveWithCache(cache);
    expect(cold.rootIslandStatus).toBe("miss");
    expect(cold.dependencyManifestStatus).toBe("miss");
    expect(cold.backingResourceCount).toBe(0);
    expect(cold.promotedResourceCount).toBe(0);
    expect(cold.loadedResourceCount).toBeGreaterThan(0);

    const warm = await resolveWithCache(cache);
    expect(warm.rootIslandStatus).toBe("hit");
    expect(warm.dependencyManifestStatus).toBe("hit");
    expect(warm.backingResourceCount).toBeGreaterThan(0);
    expect(warm.promotedResourceCount).toBeGreaterThan(0);
    // Shared logo is in both menu + footer islands → omitted from backing, re-fetched once.
    expect(warm.loadedResourceCount).toBe(1);
    expect(warm.loadedResourceCount).toBeLessThan(cold.loadedResourceCount);
    expect(warm.promotedResourceCount).toBe(warm.backingResourceCount);
  });

  it("reuses warm dependency islands when page TTL expired but manifest remains", async () => {
    let now = 0;
    const cache = new LruIslandCache({ now: () => now });

    const cold = await resolveWithCache(cache);
    expect(cold.rootIslandStatus).toBe("miss");
    expect(cold.loadedResourceCount).toBeGreaterThan(0);

    const warm = await resolveWithCache(cache);
    expect(warm.rootIslandStatus).toBe("hit");
    expect(warm.loadedResourceCount).toBe(1);

    now = DEFAULT_PAGE_ISLAND_TTL_MS + 1;

    const partial = await resolveWithCache(cache);
    expect(partial.rootIslandStatus).toBe("miss");
    expect(partial.dependencyManifestStatus).toBe("hit");
    expect(partial.backingResourceCount).toBeGreaterThan(0);
    expect(partial.loadedResourceCount).toBeGreaterThan(0);
    expect(partial.loadedResourceCount).toBeLessThan(cold.loadedResourceCount);
  });

  it("leaves unreached backing (superset) keys out of ContentMap and out of promotions", async () => {
    const cache = new LruIslandCache();
    await resolveWithCache(cache);

    const executionContext = createDefaultDemoExecutionContext();
    const pageRoot = cmsEntryAri({ id: demoIds.page, locale: executionContext.locale });
    const resolver = createDemoResolver({ schedulingMode: "barrier" });

    const { backingResources, report } = loadBackingForRoot(pageRoot, cache);
    expect(report.rootIslandStatus).toBe("hit");
    expect(backingResources.size).toBeGreaterThan(0);

    const orphanKey = cmsEntryAri({
      id: "orphan-never-reached",
      locale: executionContext.locale,
    }).toString();
    const orphanValue = { fields: { title: "orphan" } };
    backingResources.set(orphanKey, orphanValue);
    const backingSizeBefore = backingResources.size;

    const output = await resolver.resolve({
      root: pageRoot,
      executionContext,
      missingResourceMode: "throw",
      backingResources,
    });

    expect(output.errors).toEqual([]);
    expect(output.contentMap.hasKey(orphanKey)).toBe(false);
    expect(output.contentMap.getByKey(orphanKey)).toBeUndefined();
    expect(output.promotedResourceKeys).not.toContain(orphanKey);

    // The resolver never mutates the caller's backing map.
    expect(backingResources.size).toBe(backingSizeBefore);
    expect(backingResources.get(orphanKey)).toEqual(orphanValue);
  });
});
