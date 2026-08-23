import {
  ResolveContentGraphEngine,
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
import { LruIslandCache } from "./lru-island-cache.js";
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
        pulledResourceCount += result.size;
        return result;
      },
    },
  };
}

async function resolveWithCache(cache: LruIslandCache): Promise<{
  pageIslandStatus: string;
  backingResourceCount: number;
  promotedResourceCount: number;
  pulledResourceCount: number;
}> {
  const executionContext = createDefaultDemoExecutionContext();
  const pageRoot = cmsEntryAri({ id: demoIds.page, locale: executionContext.locale });
  const counting = createCountingGateway(
    createDemoDataGateway(createCmsDataLoader(demoCmsStore), createIntegrationDataLoader())
  );
  const engine = new ResolveContentGraphEngine(counting.port, createDemoExpansionPort());

  const { resolvedResourceCache, report } = loadBackingForRoot(pageRoot, cache);
  const backingResourceCount = report.backingResourceCount;

  const output = await engine.execute({
    root: pageRoot,
    executionContext,
    missingResourceMode: "throw",
    resolvedResourceCache,
  });

  expect(output.errors).toEqual([]);

  const promotedResourceCount = backingResourceCount - resolvedResourceCache.size;
  persistResolvedIslands(serializeAllIslands(output), cache);

  return {
    pageIslandStatus: report.pageIsland,
    backingResourceCount,
    promotedResourceCount,
    pulledResourceCount: counting.pulledResourceCount(),
  };
}

describe("island cache cold/warm round-trip", () => {
  it("cold resolve persists islands; warm resolve hits page backing with few/zero pulls", async () => {
    const cache = new LruIslandCache();

    const cold = await resolveWithCache(cache);
    expect(cold.pageIslandStatus).toBe("miss");
    expect(cold.backingResourceCount).toBe(0);
    expect(cold.promotedResourceCount).toBe(0);
    expect(cold.pulledResourceCount).toBeGreaterThan(0);

    const warm = await resolveWithCache(cache);
    expect(warm.pageIslandStatus).toBe("hit");
    expect(warm.backingResourceCount).toBeGreaterThan(0);
    expect(warm.promotedResourceCount).toBeGreaterThan(0);
    expect(warm.pulledResourceCount).toBe(0);
    expect(warm.promotedResourceCount).toBe(warm.backingResourceCount);
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
    const engine = new ResolveContentGraphEngine(gateway, createDemoExpansionPort());

    const { resolvedResourceCache, report } = loadBackingForRoot(pageRoot, cache);
    expect(report.pageIsland).toBe("hit");
    expect(resolvedResourceCache.size).toBeGreaterThan(0);

    const orphanKey = cmsEntryAri({
      id: "orphan-never-reached",
      locale: executionContext.locale,
    }).toString();
    const orphanValue = { fields: { title: "orphan" } };
    resolvedResourceCache.set(orphanKey, orphanValue);

    const output = await engine.execute({
      root: pageRoot,
      executionContext,
      missingResourceMode: "throw",
      resolvedResourceCache,
    });

    expect(output.errors).toEqual([]);
    expect(output.contentMap.hasKey(orphanKey)).toBe(false);
    expect(output.contentMap.getByKey(orphanKey)).toBeUndefined();
    expect(resolvedResourceCache.get(orphanKey)).toEqual(orphanValue);
  });
});
