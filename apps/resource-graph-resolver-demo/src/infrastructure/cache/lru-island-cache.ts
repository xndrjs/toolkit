import type { IslandId, SerializedIsland } from "@xndrjs/resource-graph-resolver";

import type { IslandCachePort } from "./island-cache-port.js";

export const DEFAULT_ISLAND_CACHE_TTL_MS = 60_000;
export const DEFAULT_ISLAND_CACHE_MAX_SIZE = 50;

type CacheEntry = {
  island: SerializedIsland;
  expiresAt: number;
  hitCount: number;
};

export type IslandCacheSnapshotEntry = {
  islandId: IslandId;
  expiresAt: number;
  hitCount: number;
};

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
  private readonly entries = new Map<IslandId, CacheEntry>();
  private readonly maxSize: number;
  private readonly now: () => number;

  constructor(options: LruIslandCacheOptions = {}) {
    this.maxSize = options.maxSize ?? DEFAULT_ISLAND_CACHE_MAX_SIZE;
    this.now = options.now ?? Date.now;
  }

  getIsland(islandId: IslandId): SerializedIsland | undefined {
    const entry = this.entries.get(islandId);
    if (!entry) {
      return undefined;
    }

    if (this.now() >= entry.expiresAt) {
      this.entries.delete(islandId);
      return undefined;
    }

    this.entries.delete(islandId);
    entry.hitCount += 1;
    this.entries.set(islandId, entry);
    return entry.island;
  }

  getIslands(islandIds: readonly IslandId[]): (SerializedIsland | undefined)[] {
    return islandIds.map((islandId) => this.getIsland(islandId));
  }

  setIsland(island: SerializedIsland, ttlMs: number): void {
    const existing = this.entries.get(island.islandId);
    const hitCount = existing?.hitCount ?? 0;

    if (existing) {
      this.entries.delete(island.islandId);
    } else {
      this.evictOldestWhileFull();
    }

    this.entries.set(island.islandId, {
      island,
      expiresAt: this.now() + ttlMs,
      hitCount,
    });
  }

  /** Live view of non-expired entries for the demo monitor panel. */
  snapshot(): IslandCacheSnapshot {
    this.purgeExpired();

    return {
      entries: [...this.entries.entries()].map(([islandId, entry]) => ({
        islandId,
        expiresAt: entry.expiresAt,
        hitCount: entry.hitCount,
      })),
      size: this.entries.size,
      maxSize: this.maxSize,
    };
  }

  /** Test helper: drop all entries. */
  clear(): void {
    this.entries.clear();
  }

  private evictOldestWhileFull(): void {
    while (this.entries.size >= this.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }
      this.entries.delete(oldestKey);
    }
  }

  private purgeExpired(): void {
    const now = this.now();
    for (const [islandId, entry] of this.entries) {
      if (now >= entry.expiresAt) {
        this.entries.delete(islandId);
      }
    }
  }
}

/** Process-wide demo island cache (module singleton). */
export const lruIslandCache = new LruIslandCache();
