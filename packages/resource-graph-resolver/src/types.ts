import type { AddressableResourceIdentifier } from "@xndrjs/addressable-resources";

import type { ResolutionError } from "./errors";
import type { ContentMap } from "./model/content-map";
import type { IslandDependencyMap } from "./model/island-dependency-map";
import type { IslandMap } from "./model/island-map";

/** Stable string key for a resource, produced by `resource.toString()`. */
export type ResourceKey = string;

/** Payload shape for a narrowed ARI within a project {@link ContentRegistry}. */
export type RegistryPayloadFor<
  R extends ContentRegistry,
  Resource extends AddressableResourceIdentifier,
> = Resource extends AddressableResourceIdentifier<infer T extends keyof R & string> ? R[T] : never;

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

/**
 * Per-edge policy for a child discovered by expansion when its load fails.
 *
 * - `throw` — abort resolution (default when omitted).
 * - `setNull` — record a {@link ResolutionError} in `errors` / failures, omit the
 *   payload, and continue; projectors treat the alias as `null`.
 * - `setError` — record a {@link ResolutionError} in `errors` / failures and continue;
 *   generated projectors place its JSON-safe data representation on the alias.
 *
 * Roots always throw. When the same ARI is reached by several edges, the
 * strictest policy wins (`throw` > `setError` > `setNull`).
 */
export type OnFailurePolicy = "throw" | "setNull" | "setError";

/**
 * When expansion runs relative to in-flight loads.
 *
 * - `lane` — expand as soon as any source batch commits; a fast source never
 *   waits on a slow peer.
 * - `barrier` — wait for every in-flight batch, then expand together; rounds are
 *   reproducible, but wall clock tracks the slowest source in each round.
 */
export type SchedulingMode = "lane" | "barrier";

/** Hard limits applied to one resource-graph resolution. */
export interface ResolutionBudget {
  /** Maximum distinct ARIs discovered, including roots and redirect locators. */
  maxNodes: number;
  /** Maximum distinct expansion and redirect edges discovered. */
  maxEdges: number;
  /** Maximum datasource `load` calls started across every source. */
  maxBatches: number;
  /** Maximum wall-clock duration of one resolution. */
  maxDurationMs: number;
}

/** Per-resolver overrides; omitted fields retain the safe defaults. */
export type ResolutionBudgetOptions = Partial<ResolutionBudget>;

/** Counters captured when resolution completes or exceeds a budget. */
export interface ResolutionBudgetUsage {
  nodes: number;
  edges: number;
  batches: number;
  durationMs: number;
}

/** The limit that stopped resolution. */
export type ResolutionBudgetKind = keyof ResolutionBudget;

export interface ResolveResourceGraphInput<TExecutionContext = unknown> {
  /** Seed ARIs for one resolution session; must be non-empty. */
  roots: readonly AddressableResourceIdentifier[];
  executionContext: TExecutionContext;
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
  /**
   * Failure lookup by canonical key and every redirect alias. Alias entries
   * point at the same canonically attributed {@link ResolutionError} instance.
   */
  failures: ReadonlyMap<ResourceKey, ResolutionError>;
  /** Backing keys the walk actually reached, in promotion order. */
  promotedResourceKeys: readonly ResourceKey[];
  /**
   * Locator ARI key → canonical settle target (strategy `resolve` redirects).
   * Projectors follow this so `@binding` identity refs use the canonical ARI key.
   */
  redirects: ReadonlyMap<ResourceKey, AddressableResourceIdentifier>;
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
