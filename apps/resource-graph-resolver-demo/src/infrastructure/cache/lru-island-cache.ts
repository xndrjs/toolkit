import type { IslandId, SerializedIsland } from "@xndrjs/resource-graph-resolver";

import type {
  IslandCachePort,
  IslandCacheTier,
  IslandDependencyManifest,
} from "./island-cache-port.js";

/** @deprecated Use DEFAULT_PAGE_ISLAND_TTL_MS for page roots. */
export const DEFAULT_ISLAND_CACHE_TTL_MS = 60_000;

export const DEFAULT_PAGE_ISLAND_TTL_MS = 60_000;
export const DEFAULT_DEPENDENCY_ISLAND_TTL_MS = 3_600_000;
export const DEFAULT_DEPENDENCY_MANIFEST_TTL_MS = 3_600_000;
export const DEFAULT_ISLAND_CACHE_MAX_SIZE = 50;

type IslandCacheEntry = {
  island: SerializedIsland;
  tier: IslandCacheTier;
  expiresAt: number;
  hitCount: number;
};

type ManifestCacheEntry = {
  manifest: IslandDependencyManifest;
  expiresAt: number;
  hitCount: number;
};

export type IslandCacheSnapshotIslandEntry = {
  kind: "island";
  islandId: IslandId;
  tier: IslandCacheTier;
  expiresAt: number;
  hitCount: number;
  island: SerializedIsland;
};

export type IslandCacheSnapshotManifestEntry = {
  kind: "manifest";
  islandId: IslandId;
  tier: "manifest";
  expiresAt: number;
  hitCount: number;
  manifest: IslandDependencyManifest;
};

export type IslandCacheSnapshotEntry =
  | IslandCacheSnapshotIslandEntry
  | IslandCacheSnapshotManifestEntry;

/** @deprecated Use IslandCacheSnapshotEntry. */
export type IslandCacheSnapshotEntryMetadata = Pick<
  IslandCacheSnapshotIslandEntry,
  "islandId" | "expiresAt" | "hitCount"
>;

export type IslandCacheSnapshot = {
  entries: IslandCacheSnapshotEntry[];
  size: number;
  maxSize: number;
};

export type LruIslandCacheOptions = {
  maxSize?: number;
  /** Injectable clock for tests (epoch ms). */
  now?: () => number;
};

/**
 * In-memory LRU island cache with per-entry TTL.
 * Evicts the least-recently-used entry when `maxSize` is exceeded.
 */
export class LruIslandCache implements IslandCachePort {
  private readonly islandEntries = new Map<IslandId, IslandCacheEntry>();
  private readonly manifestEntries = new Map<IslandId, ManifestCacheEntry>();
  private readonly maxSize: number;
  private readonly now: () => number;

  constructor(options: LruIslandCacheOptions = {}) {
    this.maxSize = options.maxSize ?? DEFAULT_ISLAND_CACHE_MAX_SIZE;
    this.now = options.now ?? Date.now;
  }

  getIsland(islandId: IslandId): SerializedIsland | undefined {
    const entry = this.islandEntries.get(islandId);
    if (!entry) {
      return undefined;
    }

    if (this.now() >= entry.expiresAt) {
      this.islandEntries.delete(islandId);
      return undefined;
    }

    this.islandEntries.delete(islandId);
    entry.hitCount += 1;
    this.islandEntries.set(islandId, entry);
    return entry.island;
  }

  getIslands(islandIds: readonly IslandId[]): (SerializedIsland | undefined)[] {
    return islandIds.map((islandId) => this.getIsland(islandId));
  }

  setIsland(island: SerializedIsland, ttlMs: number, tier: IslandCacheTier = "dependency"): void {
    const existing = this.islandEntries.get(island.islandId);
    const hitCount = existing?.hitCount ?? 0;

    if (existing) {
      this.islandEntries.delete(island.islandId);
    } else {
      this.evictOldestIslandWhileFull();
    }

    this.islandEntries.set(island.islandId, {
      island,
      tier,
      expiresAt: this.now() + ttlMs,
      hitCount,
    });
  }

  getDependencyManifest(islandId: IslandId): IslandDependencyManifest | undefined {
    const entry = this.manifestEntries.get(islandId);
    if (!entry) {
      return undefined;
    }

    if (this.now() >= entry.expiresAt) {
      this.manifestEntries.delete(islandId);
      return undefined;
    }

    this.manifestEntries.delete(islandId);
    entry.hitCount += 1;
    this.manifestEntries.set(islandId, entry);
    return entry.manifest;
  }

  setDependencyManifest(manifest: IslandDependencyManifest, ttlMs: number): void {
    const existing = this.manifestEntries.get(manifest.islandId);
    const hitCount = existing?.hitCount ?? 0;

    this.manifestEntries.set(manifest.islandId, {
      manifest,
      expiresAt: this.now() + ttlMs,
      hitCount,
    });
  }

  /** Live view of non-expired entries for the demo monitor panel. */
  snapshot(): IslandCacheSnapshot {
    this.purgeExpired();

    const islandEntries: IslandCacheSnapshotIslandEntry[] = [...this.islandEntries.entries()].map(
      ([islandId, entry]) => ({
        kind: "island",
        islandId,
        tier: entry.tier,
        expiresAt: entry.expiresAt,
        hitCount: entry.hitCount,
        island: entry.island,
      })
    );

    const manifestEntries: IslandCacheSnapshotManifestEntry[] = [
      ...this.manifestEntries.entries(),
    ].map(([islandId, entry]) => ({
      kind: "manifest",
      islandId,
      tier: "manifest" as const,
      expiresAt: entry.expiresAt,
      hitCount: entry.hitCount,
      manifest: entry.manifest,
    }));

    const entries = [...islandEntries, ...manifestEntries].sort((left, right) =>
      left.islandId.localeCompare(right.islandId)
    );

    return {
      entries,
      size: this.islandEntries.size + this.manifestEntries.size,
      maxSize: this.maxSize,
    };
  }

  /** Drop all entries (demo “Clear cache” + tests). */
  clear(): void {
    this.islandEntries.clear();
    this.manifestEntries.clear();
  }

  private evictOldestIslandWhileFull(): void {
    while (this.islandEntries.size >= this.maxSize) {
      const oldestKey = this.islandEntries.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }
      this.islandEntries.delete(oldestKey);
    }
  }

  private purgeExpired(): void {
    const now = this.now();
    for (const [islandId, entry] of this.islandEntries) {
      if (now >= entry.expiresAt) {
        this.islandEntries.delete(islandId);
      }
    }
    for (const [islandId, entry] of this.manifestEntries) {
      if (now >= entry.expiresAt) {
        this.manifestEntries.delete(islandId);
      }
    }
  }
}

/** Process-wide demo island cache (module singleton). */
export const lruIslandCache = new LruIslandCache();
