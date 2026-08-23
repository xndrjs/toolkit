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

function manifestStatus(
  manifest: { dependencies: readonly string[] } | undefined
): IslandCacheLookupStatus {
  return manifest ? "hit" : "miss";
}

/**
 * Loads the page island when available, otherwise falls back to the long-lived
 * dependency manifest. Builds backing from complete page and/or dependency islands.
 */
export function loadBackingForRoot(
  pageRoot: ApplicationResourceIdentifier,
  cache: IslandCachePort
): LoadBackingForRootResult {
  const pageIslandId = pageRoot.toString();
  const pageIsland = cache.getIsland(pageIslandId);
  const pageStatus = lookupStatus(pageIsland);

  const manifest =
    pageStatus === "hit" && pageIsland
      ? { dependencies: pageIsland.dependencies }
      : cache.getDependencyManifest(pageIslandId);
  const manifestHitStatus = manifestStatus(manifest);

  if (pageStatus !== "hit" && manifestHitStatus !== "hit") {
    return {
      resolvedResourceCache: new Map(),
      report: {
        pageIsland: pageStatus,
        dependencyManifest: manifestHitStatus,
        islands: [],
        backingResourceCount: 0,
      },
    };
  }

  const dependencyIds = manifest?.dependencies ?? [];
  const dependencyIslands = cache.getIslands(dependencyIds);

  const completeIslands: SerializedIsland[] = [];
  if (pageStatus === "hit" && pageIsland) {
    completeIslands.push(pageIsland);
  }

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
      pageIsland: pageStatus,
      dependencyManifest: manifestHitStatus,
      islands,
      backingResourceCount: resolvedResourceCache.size,
    },
  };
}
