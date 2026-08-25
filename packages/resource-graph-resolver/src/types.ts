import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ContentMap } from "./model/content-map";
import type { IslandDependencyMap } from "./model/island-dependency-map";
import type { IslandMap } from "./model/island-map";

/** Stable string key for a resource, produced by `resource.toString()`. */
export type ResourceKey = string;

/** Payload shape for a narrowed ARI within a project {@link ContentRegistry}. */
export type RegistryPayloadFor<
  R extends ContentRegistry,
  Resource extends ApplicationResourceIdentifier,
> = Resource extends ApplicationResourceIdentifier<infer T extends keyof R & string> ? R[T] : never;

/** One loaded resource with correlated ARI and payload. */
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
 * The resolver stays schema-agnostic; apps supply a concrete registry.
 */
export type ContentRegistry = Record<string, unknown>;

type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (
  value: infer I
) => void
  ? I
  : never;

/**
 * Flattens per-source registry slices into one project registry, so hovers and
 * type errors show a single object instead of a chain of intersections.
 *
 * ```ts
 * type AppRegistry = ComposeContentRegistry<[CmsRegistry, IntegrationRegistry]>;
 * ```
 */
export type ComposeContentRegistry<Slices extends readonly ContentRegistry[]> = {
  [K in keyof UnionToIntersection<Slices[number]>]: UnionToIntersection<Slices[number]>[K];
};

export type MissingResourceMode = "throw" | "collect";

/**
 * When expansion runs relative to in-flight loads.
 *
 * - `lane` — expand as soon as any source batch commits; a fast source never
 *   waits on a slow peer.
 * - `barrier` — wait for every in-flight batch, then expand together; rounds are
 *   reproducible, but wall clock tracks the slowest source in each round.
 */
export type ResolutionStrategy = "lane" | "barrier";

export interface ResolutionError {
  resourceKey: ResourceKey;
  message: string;

  /**
   * Islands from which the missing resource was reached.
   * The resource was never resolved, so it has no effective island of its own.
   */
  inheritedIslandIds: readonly IslandId[];
}

export interface ResolveResourceGraphInput<TExecutionContext = unknown> {
  root: ApplicationResourceIdentifier;
  executionContext: TExecutionContext;
  missingResourceMode: MissingResourceMode;
  /**
   * Opaque pre-resolved payloads consulted before any source is asked.
   * The map is never mutated; promoted keys are reported as
   * {@link ResolveResourceGraphOutput.promotedResourceKeys}.
   */
  backingResources?: ReadonlyMap<ResourceKey, unknown>;
  /** Cooperative cancellation; checked around every load and forwarded to sources. */
  signal?: AbortSignal;
}

export interface ResolveResourceGraphOutput<R extends ContentRegistry = ContentRegistry> {
  contentMap: ContentMap<R>;
  islands: IslandMap;
  islandDependencies: IslandDependencyMap;
  errors: readonly ResolutionError[];
  /** Backing keys the walk actually reached, in promotion order. */
  promotedResourceKeys: readonly ResourceKey[];
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
