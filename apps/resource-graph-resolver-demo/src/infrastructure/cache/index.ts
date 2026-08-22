export type {
  CacheHitReport,
  IslandCacheLookupStatus,
  IslandCachePort,
} from "./island-cache-port.js";
export { loadBackingForRoot, type LoadBackingForRootResult } from "./load-backing-for-root.js";
export {
  DEFAULT_ISLAND_CACHE_MAX_SIZE,
  DEFAULT_ISLAND_CACHE_TTL_MS,
  LruIslandCache,
  lruIslandCache,
  type IslandCacheSnapshot,
  type IslandCacheSnapshotEntry,
  type LruIslandCacheOptions,
} from "./lru-island-cache.js";
export { persistResolvedIslands } from "./persist-resolved-islands.js";
