import type { SerializedIsland } from "@xndrjs/resource-graph-resolver";

import type { IslandCachePort } from "./island-cache-port.js";
import { DEFAULT_ISLAND_CACHE_TTL_MS } from "./lru-island-cache.js";

/**
 * Writes only complete islands into the island cache.
 * Partial islands are skipped (hydrate policy: complete only).
 */
export function persistResolvedIslands(
  islands: readonly SerializedIsland[],
  cache: IslandCachePort,
  ttlMs: number = DEFAULT_ISLAND_CACHE_TTL_MS
): void {
  for (const island of islands) {
    if (island.completeness !== "complete") {
      continue;
    }
    cache.setIsland(island, ttlMs);
  }
}
