import {
  BarrierResolveContentGraphEngine,
  serializeAllIslands,
  type DataResolutionPort,
} from "@xndrjs/resource-graph-resolver";
import { describe, expect, it } from "vitest";

import { createCmsDataLoader, cmsEntryAri, demoCmsStore, demoIds } from "../cms/index.js";
import type { DemoContentRegistry } from "../content-registry.js";
import { createDemoDataGateway } from "../demo-data-gateway.js";
import { createDefaultDemoExecutionContext } from "../demo-execution-context.js";
import { createDemoExpansionPort } from "../expansion-policies.js";
import { createIntegrationDataLoader } from "../integration/index.js";
import { loadBackingForRoot } from "./load-backing-for-root.js";
import { DEFAULT_PAGE_ISLAND_TTL_MS, LruIslandCache } from "./lru-island-cache.js";
import { persistResolvedIslands } from "./persist-resolved-islands.js";

function createCountingGateway(inner: DataResolutionPort<DemoContentRegistry>): {
  port: DataResolutionPort<DemoContentRegistry>;
  pulledResourceCount: () => number;
} {
  let pulledResourceCount = 0;
  return {
    pulledResourceCount: () => pulledResourceCount,
    port: {
      async process(pull) {
        const result = await inner.process(pull);
        pulledResourceCount += result.length;
        return result;
      },
    },
  };
}

async function resolveWithCache(cache: LruIslandCache): Promise<{
  rootIslandStatus: string;
  dependencyManifestStatus: string;
  backingResourceCount: number;
  promotedResourceCount: number;
  pulledResourceCount: number;
}> {
  const executionContext = createDefaultDemoExecutionContext();
  const pageRoot = cmsEntryAri({ id: demoIds.page, locale: executionContext.locale });
  const counting = createCountingGateway(
    createDemoDataGateway(createCmsDataLoader(demoCmsStore), createIntegrationDataLoader())
  );
  const engine = new BarrierResolveContentGraphEngine(counting.port, createDemoExpansionPort());

  const { backingResources, report } = loadBackingForRoot(pageRoot, cache);
  const backingResourceCount = report.backingResourceCount;

  const output = await engine.execute({
    root: pageRoot,
    executionContext,
    missingResourceMode: "throw",
    backingResources,
  });

  expect(output.errors).toEqual([]);

  const promotedResourceCount = backingResourceCount - backingResources.size;
  persistResolvedIslands(serializeAllIslands(output), cache, {
    rootIslandId: pageRoot.toString(),
    islandDependencies: output.islandDependencies,
  });

  return {
    rootIslandStatus: report.rootIslandStatus,
    dependencyManifestStatus: report.dependencyManifest,
    backingResourceCount,
    promotedResourceCount,
    pulledResourceCount: counting.pulledResourceCount(),
  };
}

describe("island cache cold/warm round-trip", () => {
  it("cold resolve persists islands; warm resolve hits page backing with few/zero pulls", async () => {
    const cache = new LruIslandCache();

    const cold = await resolveWithCache(cache);
    expect(cold.rootIslandStatus).toBe("miss");
    expect(cold.dependencyManifestStatus).toBe("miss");
    expect(cold.backingResourceCount).toBe(0);
    expect(cold.promotedResourceCount).toBe(0);
    expect(cold.pulledResourceCount).toBeGreaterThan(0);

    const warm = await resolveWithCache(cache);
    expect(warm.rootIslandStatus).toBe("hit");
    expect(warm.dependencyManifestStatus).toBe("hit");
    expect(warm.backingResourceCount).toBeGreaterThan(0);
    expect(warm.promotedResourceCount).toBeGreaterThan(0);
    // Shared logo is in both menu + footer islands → omitted from backing, re-pulled once.
    expect(warm.pulledResourceCount).toBe(1);
    expect(warm.pulledResourceCount).toBeLessThan(cold.pulledResourceCount);
    expect(warm.promotedResourceCount).toBe(warm.backingResourceCount);
  });

  it("reuses warm dependency islands when page TTL expired but manifest remains", async () => {
    let now = 0;
    const cache = new LruIslandCache({ now: () => now });

    const cold = await resolveWithCache(cache);
    expect(cold.rootIslandStatus).toBe("miss");
    expect(cold.pulledResourceCount).toBeGreaterThan(0);

    const warm = await resolveWithCache(cache);
    expect(warm.rootIslandStatus).toBe("hit");
    expect(warm.pulledResourceCount).toBe(1);

    now = DEFAULT_PAGE_ISLAND_TTL_MS + 1;

    const partial = await resolveWithCache(cache);
    expect(partial.rootIslandStatus).toBe("miss");
    expect(partial.dependencyManifestStatus).toBe("hit");
    expect(partial.backingResourceCount).toBeGreaterThan(0);
    expect(partial.pulledResourceCount).toBeGreaterThan(0);
    expect(partial.pulledResourceCount).toBeLessThan(cold.pulledResourceCount);
  });

  it("does not place unreached backing (superset) keys into ContentMap", async () => {
    const cache = new LruIslandCache();
    await resolveWithCache(cache);

    const executionContext = createDefaultDemoExecutionContext();
    const pageRoot = cmsEntryAri({ id: demoIds.page, locale: executionContext.locale });
    const gateway = createDemoDataGateway(
      createCmsDataLoader(demoCmsStore),
      createIntegrationDataLoader()
    );
    const engine = new BarrierResolveContentGraphEngine(gateway, createDemoExpansionPort());

    const { backingResources, report } = loadBackingForRoot(pageRoot, cache);
    expect(report.rootIslandStatus).toBe("hit");
    expect(backingResources.size).toBeGreaterThan(0);

    const orphanKey = cmsEntryAri({
      id: "orphan-never-reached",
      locale: executionContext.locale,
    }).toString();
    const orphanValue = { fields: { title: "orphan" } };
    backingResources.set(orphanKey, orphanValue);

    const output = await engine.execute({
      root: pageRoot,
      executionContext,
      missingResourceMode: "throw",
      backingResources,
    });

    expect(output.errors).toEqual([]);
    expect(output.contentMap.hasKey(orphanKey)).toBe(false);
    expect(output.contentMap.getByKey(orphanKey)).toBeUndefined();
    expect(backingResources.get(orphanKey)).toEqual(orphanValue);
  });
});
