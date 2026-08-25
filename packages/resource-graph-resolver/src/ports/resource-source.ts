import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ContentRegistry, RegistryPayloadFor, ResolvedResourceRecord } from "../types";

/**
 * Matcher for one ARI family, used both for routing and for narrowing.
 *
 * Any `AriFactory` from `@xndrjs/application-resources` satisfies this shape.
 */
export interface ResourceFamily<
  Resource extends ApplicationResourceIdentifier = ApplicationResourceIdentifier,
> {
  readonly type: string;
  matches(candidate: ApplicationResourceIdentifier): candidate is Resource;
}

/** Families a source owns, keyed by a local name used in batches and batch sizes. */
export type ResourceFamilyMap = Record<string, ResourceFamily>;

/** The narrowed ARI type behind a {@link ResourceFamily}. */
export type ResourceOfFamily<F> = F extends ResourceFamily<infer Resource> ? Resource : never;

/** One load's work, grouped by family and narrowed per family. */
export type PendingResourceBatch<F extends ResourceFamilyMap> = {
  readonly [K in keyof F]: readonly ResourceOfFamily<F[K]>[];
};

/**
 * Records a source may return: only its own families, each paired with the
 * payload its ARI type maps to in the registry.
 */
export type SourceResourceRecord<R extends ContentRegistry, F extends ResourceFamilyMap> = {
  [K in keyof F]: {
    resource: ResourceOfFamily<F[K]>;
    payload: RegistryPayloadFor<R, ResourceOfFamily<F[K]>>;
  };
}[keyof F];

/** Maximum ARIs per family in a single load. Omit a family for "no limit". */
export type ResourceBatchSizeMap<F extends ResourceFamilyMap> = {
  readonly [K in keyof F]?: number;
};

export interface ResourceLoadContext<TExecutionContext = unknown> {
  /**
   * Resolution abort signal. Forward it into `fetch` (or equivalent) so an
   * aborted resolution cancels in-flight IO instead of merely ignoring it.
   */
  readonly signal?: AbortSignal;
  readonly executionContext: TExecutionContext;
  /** 1-based counter of loads issued to this source within one resolution. */
  readonly batchNumber: number;
}

/**
 * Definition of one backend and the ARI families it owns.
 *
 * The resolver owns routing, chunking, throttling and scheduling; a source only
 * declares what it owns and how to fetch it. Retry and backoff belong inside
 * {@link load} — a source has at most {@link concurrency} loads in flight, so
 * awaiting there throttles that backend only.
 *
 * `R` is the whole project registry, not the source's own slice: payload shapes
 * are a project-wide contract, and {@link families} is what scopes a source to
 * the ARI types it may be asked for and may return.
 */
export interface ResourceSourceDefinition<
  R extends ContentRegistry,
  F extends ResourceFamilyMap,
  TExecutionContext = unknown,
> {
  /** Stable identifier used in observer events and error messages. */
  readonly id: string;
  readonly families: F;
  readonly batchSize?: ResourceBatchSizeMap<F>;
  /** Loads this backend tolerates in parallel. Defaults to 1 (serial). */
  readonly concurrency?: number;
  /**
   * Fetch one batch. Omit a requested ARI from the result once retries are
   * exhausted — the resolver treats it as a missing resource.
   */
  load(
    batch: PendingResourceBatch<F>,
    context: ResourceLoadContext<TExecutionContext>
  ): Promise<readonly SourceResourceRecord<R, F>[]>;
}

/** Family-erased source consumed by the resolver. Build one with {@link defineResourceSourceFor}. */
export interface ResourceSource<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  readonly id: string;
  readonly families: ResourceFamilyMap;
  readonly batchSize: Readonly<Record<string, number | undefined>>;
  readonly concurrency: number;
  load(
    batch: Readonly<Record<string, readonly ApplicationResourceIdentifier[]>>,
    context: ResourceLoadContext<TExecutionContext>
  ): Promise<readonly ResolvedResourceRecord<R>[]>;
}

/**
 * Curried so `families` is inferred while the registry stays explicit
 * (TypeScript has no partial type-argument inference).
 *
 * ```ts
 * const defineSource = defineResourceSourceFor<AppRegistry, ExecutionContext>();
 * const cmsSource = defineSource({ id: "cms", families: { entry: cmsEntryAri }, load });
 * ```
 */
export function defineResourceSourceFor<R extends ContentRegistry, TExecutionContext = unknown>(): <
  F extends ResourceFamilyMap,
>(
  definition: ResourceSourceDefinition<R, F, TExecutionContext>
) => ResourceSource<R, TExecutionContext> {
  return <F extends ResourceFamilyMap>(
    definition: ResourceSourceDefinition<R, F, TExecutionContext>
  ): ResourceSource<R, TExecutionContext> => {
    const load = definition.load.bind(definition) as ResourceSource<R, TExecutionContext>["load"];

    return {
      id: definition.id,
      families: definition.families,
      batchSize: definition.batchSize ?? {},
      concurrency: Math.max(1, Math.trunc(definition.concurrency ?? 1)),
      load,
    };
  };
}
