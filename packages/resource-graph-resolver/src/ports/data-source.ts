import type { AddressableResourceIdentifier } from "@xndrjs/addressable-resources";

import type { ContentRegistry, RegistryPayloadFor } from "../types";

/**
 * Matcher for one ARI family, used both for routing and for narrowing.
 *
 * Any `AriFactory` from `@xndrjs/addressable-resources` satisfies this shape.
 */
export interface ResourceFamily<
  Resource extends AddressableResourceIdentifier = AddressableResourceIdentifier,
> {
  readonly type: string;
  matches(candidate: AddressableResourceIdentifier): candidate is Resource;
}

/** The narrowed ARI type behind a {@link ResourceFamily}. */
export type ResourceOfFamily<F> = F extends ResourceFamily<infer Resource> ? Resource : never;

/** Union of ARI types handled by a source's `for` list. */
export type ResourceUnionFromFamilies<F extends readonly ResourceFamily[]> = ResourceOfFamily<
  F[number]
>;

/**
 * One slot in a `load` result: payload for that batch index, or `undefined` when
 * missing. `null` is a valid payload value and must not be used as a miss sentinel.
 */
export type SourcePayloadSlot<R extends ContentRegistry, F extends readonly ResourceFamily[]> =
  | {
      [K in keyof F]: RegistryPayloadFor<R, ResourceOfFamily<F[K]>>;
    }[number]
  | undefined;

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

export interface SourceRouteContext<TExecutionContext = unknown> {
  readonly resource: AddressableResourceIdentifier;
  readonly executionContext: TExecutionContext;
}

/**
 * Definition of one backend transport channel and the ARI families it handles.
 *
 * The resolver owns routing, chunking, throttling and scheduling; a source only
 * declares what it handles and how to fetch a batch. Retry and backoff belong
 * inside {@link load} — a source has at most {@link concurrency} loads in
 * flight, so awaiting there throttles that backend only.
 *
 * `R` is the whole project registry, not the source's own slice: payload shapes
 * are a project-wide contract, and {@link for} is what scopes a source to the
 * ARI types it may be asked for.
 *
 * When several sources can handle the same ARI, the resolver picks the first
 * match in `sources` order whose optional {@link when} predicate passes.
 * Overlaps are not validated — declare one owner per ARI family.
 *
 * Redirects / identity hops are **not** expressed from `load` — use strategy
 * `resolve` policies after a decode payload is committed.
 */
export interface DataSourceDefinition<
  R extends ContentRegistry,
  F extends readonly ResourceFamily[],
  TExecutionContext = unknown,
> {
  /** Stable identifier used in observer events and error messages. */
  readonly id: string;
  /** ARI factories this transport channel handles. */
  readonly for: F;
  /** Maximum ARIs per load. Omit for no limit. */
  readonly batchSize?: number;
  /** Loads this backend tolerates in parallel. Defaults to 1 (serial). */
  readonly concurrency?: number;
  /**
   * Optional routing predicate evaluated before `for` matching. Use only to pick
   * among transport channels — not for expansion, islands, or business logic.
   */
  readonly when?: (context: SourceRouteContext<TExecutionContext>) => boolean;
  /**
   * Fetch one batch. Return value must have the **same length and order** as
   * `batch`: `results[i]` is the payload for `batch[i]`, or `undefined` on miss
   * (`null` remains a legal payload).
   */
  load(
    batch: readonly ResourceUnionFromFamilies<F>[],
    context: ResourceLoadContext<TExecutionContext>
  ): Promise<readonly SourcePayloadSlot<R, F>[]>;
}

/** Family-erased source consumed by the resolver. Build one with {@link defineDataSourceFor}. */
export interface DataSource<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  readonly id: string;
  readonly for: readonly ResourceFamily[];
  readonly batchSize?: number;
  readonly concurrency: number;
  readonly when?: (context: SourceRouteContext<TExecutionContext>) => boolean;
  load(
    batch: readonly AddressableResourceIdentifier[],
    context: ResourceLoadContext<TExecutionContext>
  ): Promise<readonly (R[keyof R & string] | undefined)[]>;
}

/**
 * Curried so `for` is inferred while the registry stays explicit
 * (TypeScript has no partial type-argument inference).
 *
 * ```ts
 * const defineSource = defineDataSourceFor<AppRegistry, ExecutionContext>();
 * const cmsSource = defineSource({
 *   id: "cms",
 *   for: [cmsEntryAri, cmsAssetAri],
 *   batchSize: 100,
 *   load(batch, { signal }) { ... },
 * });
 * ```
 */
export function defineDataSourceFor<R extends ContentRegistry, TExecutionContext = unknown>(): <
  const F extends readonly ResourceFamily[],
>(
  definition: DataSourceDefinition<R, F, TExecutionContext>
) => DataSource<R, TExecutionContext> {
  return <const F extends readonly ResourceFamily[]>(
    definition: DataSourceDefinition<R, F, TExecutionContext>
  ): DataSource<R, TExecutionContext> => {
    const load = definition.load.bind(definition) as DataSource<R, TExecutionContext>["load"];

    return {
      id: definition.id,
      for: definition.for,
      batchSize: definition.batchSize,
      concurrency: Math.max(1, Math.trunc(definition.concurrency ?? 1)),
      ...(definition.when !== undefined ? { when: definition.when } : {}),
      load,
    };
  };
}
