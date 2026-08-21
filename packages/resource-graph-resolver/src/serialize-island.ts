import type { IslandId, ResolveContentGraphOutput, ResourceKey, SerializedIsland } from "./types";

/**
 * Materializes one island for cache/JSON storage from membership + content values.
 *
 * Island roots referenced only as dependencies are not included in `resources`
 * (Annotation 1: dependencies ≠ membership).
 */
export function serializeIsland(
  islandId: IslandId,
  result: ResolveContentGraphOutput
): SerializedIsland {
  const resourceKeys = result.islands.get(islandId);

  const resources = Object.fromEntries(
    [...resourceKeys].map((resourceKey) => {
      if (!result.contentMap.hasKey(resourceKey)) {
        throw new Error(`Island ${islandId} references missing resource ${resourceKey}`);
      }

      return [resourceKey, result.contentMap.getByKey(resourceKey)];
    })
  ) as Record<ResourceKey, unknown>;

  const missingResources = result.errors
    .filter((error) => error.inheritedIslandIds.includes(islandId))
    .map((error) => error.resourceKey);

  return {
    schemaVersion: 1,
    islandId,
    completeness: missingResources.length > 0 ? "partial" : "complete",
    missingResources,
    dependencies: [...result.islandDependencies.get(islandId)],
    resources,
  };
}
