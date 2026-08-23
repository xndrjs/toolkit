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

/**
 * Optional safety budgets for {@link import("./resolve-content-graph-engine").ResolveContentGraphEngine}.
 *
 * - {@link maxRounds} — frontier rounds processed (each outer-loop iteration)
 * - {@link maxResources} — distinct ARIs discovered (root counts as 1)
 * - {@link maxDepth} — BFS depth from root (root is depth 0)
 *
 * Exceeding a limit throws {@link import("./errors").ResolveContentGraphLimitExceededError},
 * independent of {@link MissingResourceMode}.
 */
export interface ResolveContentGraphLimits {
  maxRounds?: number;
  maxResources?: number;
  maxDepth?: number;
}

export interface ResolveContentGraphInput<TExecutionContext = unknown> {
  root: ApplicationResourceIdentifier;
  executionContext: TExecutionContext;
  missingResourceMode: MissingResourceMode;
  /**
   * Opaque payloads consulted before DataResolutionPort.
   * Entries are promoted into ContentMap only when the frontier reaches them,
   * then removed from this map (caller may pass a mutable Map).
   */
  resolvedResourceCache?: Map<ResourceKey, unknown>;
  /** Cooperative cancellation; checked before and after every data-port load. */
  signal?: AbortSignal;
  /** Optional caps on rounds, discovered resources, and expansion depth. */
  limits?: ResolveContentGraphLimits;
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
