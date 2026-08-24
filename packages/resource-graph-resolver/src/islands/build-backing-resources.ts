import type { IslandId, ResourceKey, SerializedIsland } from "../types";

/** Which serialized islands contribute resources to the backing map. */
export type BackingResourcesIslandPolicy = "only-complete" | "all";

export type BackingResourceConflict = {
  resourceKey: ResourceKey;
  existing: unknown;
  incoming: unknown;
  existingIslandId: IslandId;
  incomingIslandId: IslandId;
};

export type BackingResourcesFromIslandsOptions = {
  policy: BackingResourcesIslandPolicy;
  /**
   * Called whenever the key is already present in the backing map and another
   * island tries to contribute a value for the same `resourceKey`.
   *
   * - Returning `existing` or `incoming` keeps that value.
   * - Returning `null` or `undefined` omits the key from the backing map.
   * - Throwing rejects the whole backing build.
   */
  onResourceConflict: (conflict: BackingResourceConflict) => unknown | null | undefined;
};

/**
 * Builds backing resources from serialized islands for use as
 * `backingResources` input to the resolve engine.
 */
export function buildBackingResourcesFromIslands(
  islands: readonly SerializedIsland[],
  options: BackingResourcesFromIslandsOptions
): Map<ResourceKey, unknown> {
  const { onResourceConflict, policy } = options;

  const backingResources = new Map<ResourceKey, unknown>();
  const backingResourceOwners = new Map<ResourceKey, IslandId>();
  const omittedKeys = new Set<ResourceKey>();

  for (const island of islands) {
    if (policy === "only-complete" && island.completeness !== "complete") {
      continue;
    }

    for (const [resourceKey, value] of Object.entries(island.resources)) {
      if (omittedKeys.has(resourceKey)) {
        continue;
      }

      // New key — always takes the incoming island's payload.
      if (!backingResources.has(resourceKey)) {
        backingResources.set(resourceKey, value);
        backingResourceOwners.set(resourceKey, island.islandId);
        continue;
      }

      const existing = backingResources.get(resourceKey);

      const conflict: BackingResourceConflict = {
        resourceKey,
        existing,
        incoming: value,
        existingIslandId: backingResourceOwners.get(resourceKey)!,
        incomingIslandId: island.islandId,
      };

      const decision = onResourceConflict(conflict);

      if (decision === null || decision === undefined) {
        backingResources.delete(resourceKey);
        backingResourceOwners.delete(resourceKey);
        omittedKeys.add(resourceKey);
        continue;
      }

      backingResources.set(resourceKey, decision);
      if (Object.is(decision, conflict.existing)) {
        backingResourceOwners.set(resourceKey, conflict.existingIslandId);
      } else if (Object.is(decision, conflict.incoming)) {
        backingResourceOwners.set(resourceKey, conflict.incomingIslandId);
      } else {
        // Custom decision: attribute ownership to the incoming island.
        backingResourceOwners.set(resourceKey, conflict.incomingIslandId);
      }
    }
  }

  return backingResources;
}
