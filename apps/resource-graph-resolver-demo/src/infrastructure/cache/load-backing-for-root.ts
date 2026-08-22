import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import {
  buildResolvedResourceCacheFromIslands,
  type ResourceKey,
  type SerializedIsland,
} from "@xndrjs/resource-graph-resolver";

import type {
  CacheHitReport,
  IslandCacheLookupStatus,
  IslandCachePort,
} from "./island-cache-port.js";

export type LoadBackingForRootResult = {
  resolvedResourceCache: Map<ResourceKey, unknown>;
  report: CacheHitReport;
};

function lookupStatus(island: SerializedIsland | undefined): IslandCacheLookupStatus {
  if (!island) {
    return "miss";
  }
  if (island.completeness !== "complete") {
    return "incomplete";
  }
  return "hit";
}

/**
 * Loads the page island, then its dependencies, and builds an opaque backing map
 * from complete islands only. Miss / incomplete page → empty backing.
 */
export function loadBackingForRoot(
  pageRoot: ApplicationResourceIdentifier,
  cache: IslandCachePort
): LoadBackingForRootResult {
  const pageIslandId = pageRoot.format();
  const pageIsland = cache.getIsland(pageIslandId);
  const pageStatus = lookupStatus(pageIsland);

  if (pageStatus !== "hit" || !pageIsland) {
    return {
      resolvedResourceCache: new Map(),
      report: {
        pageIsland: pageStatus,
        islands: [],
        backingResourceCount: 0,
      },
    };
  }

  const dependencyIds = pageIsland.dependencies;
  const dependencyIslands = cache.getIslands(dependencyIds);

  const completeIslands: SerializedIsland[] = [pageIsland];
  const islands: CacheHitReport["islands"] = [];

  for (let index = 0; index < dependencyIds.length; index += 1) {
    const islandId = dependencyIds[index]!;
    const island = dependencyIslands[index];
    const status = lookupStatus(island);
    islands.push({ islandId, status });
    if (status === "hit" && island) {
      completeIslands.push(island);
    }
  }

  const resolvedResourceCache = buildResolvedResourceCacheFromIslands(completeIslands);

  return {
    resolvedResourceCache,
    report: {
      pageIsland: "hit",
      islands,
      backingResourceCount: resolvedResourceCache.size,
    },
  };
}
