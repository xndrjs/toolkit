import type { ResourceKey, SerializedIsland } from "./types";

/** Which serialized islands contribute resources to the backing map. */
export type ResolvedResourceCacheIslandPolicy = "only-complete" | "all";

/**
 * Builds an opaque backing map from serialized islands for use as
 * `resolvedResourceCache` input to the resolve engine.
 *
 * Shared resource keys across included islands are merged with last-write-wins
 * order. With `"only-complete"`, partial islands are skipped; with `"all"`,
 * every island contributes its `resources`.
 */
export function buildResolvedResourceCacheFromIslands(
  islands: readonly SerializedIsland[],
  policy: ResolvedResourceCacheIslandPolicy = "only-complete"
): Map<ResourceKey, unknown> {
  const cache = new Map<ResourceKey, unknown>();

  for (const island of islands) {
    if (policy === "only-complete" && island.completeness !== "complete") {
      continue;
    }

    for (const [resourceKey, value] of Object.entries(island.resources)) {
      cache.set(resourceKey, value);
    }
  }

  return cache;
}
