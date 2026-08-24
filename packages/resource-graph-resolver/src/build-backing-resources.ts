import type { ResourceKey, SerializedIsland } from "./types";

/** Which serialized islands contribute resources to the backing map. */
export type BackingResourcesIslandPolicy = "only-complete" | "all";

/**
 * Builds backing resources from serialized islands for use as
 * `backingResources` input to the resolve engine.
 *
 * Shared resource keys across included islands are merged with last-write-wins
 * order. With `"only-complete"`, partial islands are skipped; with `"all"`,
 * every island contributes its `resources`.
 */
export function buildBackingResourcesFromIslands(
  islands: readonly SerializedIsland[],
  policy: BackingResourcesIslandPolicy = "only-complete"
): Map<ResourceKey, unknown> {
  const backingResources = new Map<ResourceKey, unknown>();

  for (const island of islands) {
    if (policy === "only-complete" && island.completeness !== "complete") {
      continue;
    }

    for (const [resourceKey, value] of Object.entries(island.resources)) {
      backingResources.set(resourceKey, value);
    }
  }

  return backingResources;
}
