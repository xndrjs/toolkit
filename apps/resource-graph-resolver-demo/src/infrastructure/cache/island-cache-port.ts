import type { IslandId, SerializedIsland } from "@xndrjs/resource-graph-resolver";

/** Status of one island lookup against the island cache. */
export type IslandCacheLookupStatus = "hit" | "miss" | "incomplete";

/** Long-lived index of dependency island ids for a page root. */
export type IslandDependencyManifest = {
  schemaVersion: 1;
  islandId: IslandId;
  dependencies: IslandId[];
};

export type IslandCacheTier = "page" | "dependency";

/**
 * Per-request report of how the page island and its dependencies resolved
 * against the island cache before engine execute.
 */
export type CacheHitReport = {
  pageIsland: IslandCacheLookupStatus;
  dependencyManifest: IslandCacheLookupStatus;
  islands: { islandId: IslandId; status: IslandCacheLookupStatus }[];
  /** Size of the backing map immediately before execute. */
  backingResourceCount: number;
  /**
   * Resources promoted from backing during execute
   * (`backingResourceCount - remaining.size`). Set by the resolve wire-up.
   */
  promotedResourceCount?: number;
};

/** App-level port for storing and reading serialized islands. */
export interface IslandCachePort {
  getIsland(islandId: IslandId): SerializedIsland | undefined;
  getIslands(islandIds: readonly IslandId[]): (SerializedIsland | undefined)[];
  setIsland(island: SerializedIsland, ttlMs: number, tier?: IslandCacheTier): void;
  getDependencyManifest(islandId: IslandId): IslandDependencyManifest | undefined;
  setDependencyManifest(manifest: IslandDependencyManifest, ttlMs: number): void;
}
