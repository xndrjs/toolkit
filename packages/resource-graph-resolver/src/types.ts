import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ContentMap } from "./content-map";
import type { IslandDependencyMap } from "./island-dependency-map";
import type { IslandMap } from "./island-map";

/** Stable string key for a resource, produced by `resource.toString()`. */
export type ResourceKey = string;

/** Payload shape for a narrowed ARI within a project {@link ContentRegistry}. */
export type RegistryPayloadFor<
  R extends ContentRegistry,
  Resource extends ApplicationResourceIdentifier,
> = Resource extends ApplicationResourceIdentifier<infer T extends keyof R & string> ? R[T] : never;

/** One loaded resource with correlated ARI and payload — returned by {@link import("./data-resolution-port").DataResolutionPort}. */
export type ResolvedResourceRecord<R extends ContentRegistry> = {
  [T in keyof R & string]: {
    resource: ApplicationResourceIdentifier<T>;
    payload: R[T];
  };
}[keyof R & string];

/** Stable island identifier; equal to the root resource's {@link ResourceKey}. */
export type IslandId = string;

/**
 * Project-level map from ARI `type` literal to resolved payload shape.
 * The engine stays schema-agnostic; apps supply a concrete registry.
 */
export type ContentRegistry = Record<string, unknown>;

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
  executionContext: TExecutionContext;
  missingResourceMode: MissingResourceMode;
  /**
   * Opaque backing resources consulted before DataResolutionPort.
   * Entries are promoted into ContentMap only when the frontier reaches them,
   * then removed from this map (caller may pass a mutable Map).
   */
  backingResources?: Map<ResourceKey, unknown>;
  /** Cooperative cancellation; checked before and after every data-port load. */
  signal?: AbortSignal;
}

export interface ResolveContentGraphOutput<R extends ContentRegistry = ContentRegistry> {
  contentMap: ContentMap<R>;
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
