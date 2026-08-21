import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ContentMap } from "./content-map";
import type { IslandDependencyMap } from "./island-dependency-map";
import type { IslandMap } from "./island-map";

/** Stable string key for a resource, produced by `resource.format()`. */
export type ResourceKey = string;

/** Stable island identifier; equal to the root resource's {@link ResourceKey}. */
export type IslandId = string;

export type MissingResourceMode = "throw" | "collect";

export interface ResolutionError {
  resourceKey: ResourceKey;
  message: string;

  /**
   * Islands from which the missing resource was reached.
   * The resource was never resolved, so it has no effective island of its own.
   */
  inheritedIslandIds: readonly IslandId[];
}

export interface ResolveContentGraphInput<TExecutionContext = unknown> {
  root: ApplicationResourceIdentifier;
  context: TExecutionContext;
  missingResourceMode: MissingResourceMode;
}

export interface ResolveContentGraphOutput {
  contentMap: ContentMap;
  islands: IslandMap;
  islandDependencies: IslandDependencyMap;
  errors: readonly ResolutionError[];
}

/** Portable island payload for cache/JSON (schema v1). */
export interface SerializedIsland {
  schemaVersion: 1;
  islandId: IslandId;
  completeness: "complete" | "partial";
  missingResources: ResourceKey[];
  dependencies: IslandId[];
  resources: Record<ResourceKey, unknown>;
}
