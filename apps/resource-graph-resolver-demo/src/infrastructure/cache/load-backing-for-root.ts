import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import {
  buildBackingResourcesFromIslands,
  type ResourceKey,
  type SerializedIsland,
} from "@xndrjs/resource-graph-resolver";

import type {
  CacheHitReport,
  IslandCacheLookupStatus,
  IslandCachePort,
} from "./island-cache-port.js";

export type LoadBackingForRootResult = {
  backingResources: Map<ResourceKey, unknown>;
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
 * Loads the root island when available, otherwise falls back to the long-lived
 * dependency manifest. Builds backing resources from complete root and/or dependency islands.
 */
export function loadBackingForRoot(
  root: ApplicationResourceIdentifier,
  cache: IslandCachePort
): LoadBackingForRootResult {
  const rootIslandId = root.toString();
  const rootIsland = cache.getIsland(rootIslandId);
  const rootIslandStatus = lookupStatus(rootIsland);

  const manifest =
    rootIslandStatus === "hit" && rootIsland
      ? { dependencies: rootIsland.dependencies }
      : cache.getDependencyManifest(rootIslandId);

  const manifestHitStatus = manifestStatus(manifest);

  if (rootIslandStatus !== "hit" && manifestHitStatus !== "hit") {
    return {
      backingResources: new Map(),
      report: {
        rootIslandStatus,
        dependencyManifest: manifestHitStatus,
        islands: [],
        backingResourceCount: 0,
      },
    };
  }

  const dependencyIds = manifest?.dependencies ?? [];
  const dependencyIslands = cache.getIslands(dependencyIds);

  const completeIslands: SerializedIsland[] = [];
  if (rootIslandStatus === "hit" && rootIsland) {
    completeIslands.push(rootIsland);
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

  const backingResources = buildBackingResourcesFromIslands(completeIslands);

  return {
    backingResources,
    report: {
      rootIslandStatus,
      dependencyManifest: manifestHitStatus,
      islands,
      backingResourceCount: backingResources.size,
    },
  };
}
