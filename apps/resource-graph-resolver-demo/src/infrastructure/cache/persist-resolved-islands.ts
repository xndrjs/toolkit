import type {
  IslandDependencyMap,
  IslandId,
  SerializedIsland,
} from "@xndrjs/resource-graph-resolver";

import type { IslandCachePort } from "./island-cache-port.js";
import {
  DEFAULT_DEPENDENCY_ISLAND_TTL_MS,
  DEFAULT_DEPENDENCY_MANIFEST_TTL_MS,
  DEFAULT_PAGE_ISLAND_TTL_MS,
} from "./lru-island-cache.js";

export type PersistResolvedIslandsOptions = {
  rootIslandId: IslandId;
  islandDependencies: IslandDependencyMap;
  pageTtlMs?: number;
  dependencyTtlMs?: number;
  manifestTtlMs?: number;
};

/**
 * Writes only complete islands into the island cache.
 * Partial islands are skipped (hydrate policy: complete only).
 * Page root gets a short TTL and a long-lived dependency manifest.
 */
export function persistResolvedIslands(
  islands: readonly SerializedIsland[],
  cache: IslandCachePort,
  options: PersistResolvedIslandsOptions
): void {
  const pageTtlMs = options.pageTtlMs ?? DEFAULT_PAGE_ISLAND_TTL_MS;
  const dependencyTtlMs = options.dependencyTtlMs ?? DEFAULT_DEPENDENCY_ISLAND_TTL_MS;
  const manifestTtlMs = options.manifestTtlMs ?? DEFAULT_DEPENDENCY_MANIFEST_TTL_MS;

  for (const island of islands) {
    if (island.completeness !== "complete") {
      continue;
    }

    if (island.islandId === options.rootIslandId) {
      cache.setIsland(island, pageTtlMs, "page");
      cache.setDependencyManifest(
        {
          schemaVersion: 1,
          islandId: island.islandId,
          dependencies: [...options.islandDependencies.getFlatDependencies(island.islandId)],
        },
        manifestTtlMs
      );
      continue;
    }

    cache.setIsland(island, dependencyTtlMs, "dependency");
  }
}
