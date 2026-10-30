import {
  type AnyProvider,
  type IntentAlias,
  type IntentAliasPair,
  type AliasesFromWiring,
  aliasIntent,
  type ProvidersFromWiring,
  type WiringEntry,
} from "./alias-intent.js";
import type {
  AssertExplicitParamsCover,
  AssertEntryBoundaries,
  AssertNoInvalidPinnedLifetimeEdges,
  AssertNoProviderUnions,
  AssertParamsCompatible,
  AssertProvidersComplete,
  AssertSurfaceAliasesSafe,
  InferredParams,
} from "./composition/typechecks/index.js";
import { compileComposition } from "./composition/compile-composition.js";
import type {
  ComposeOptions,
  CompositionPlanDescription,
  CompositionRoot,
  EntryBoundaries,
  ExecutionContext,
  ExecutionContextArgs,
  ExecutionContextOptions,
  ExecutionSurface,
  ProviderLifetimeDescription,
  ProviderLifetimeExplanation,
  SurfaceRootDescription,
  StreamSurfaceIterable,
} from "./composition/composition-contract.js";
import { createCompositionRoot } from "./execution/composition-root.js";

export { aliasIntent };
export type { IntentAlias, IntentAliasPair, WiringEntry };
export type {
  CompositionPlanDescription,
  ComposeOptions,
  CompositionRoot,
  EntryBoundaries,
  ExecutionContext,
  ExecutionContextArgs,
  ExecutionContextOptions,
  ExecutionSurface,
  ProviderLifetimeDescription,
  ProviderLifetimeExplanation,
  SurfaceRootDescription,
  StreamSurfaceIterable,
};

type ComposeAsserts<
  Entries extends EntryBoundaries,
  Surface extends Record<string, AnyProvider>,
  Wiring extends readonly WiringEntry[],
> = AssertEntryBoundaries<Entries, Surface> &
  AssertSurfaceAliasesSafe<Surface> &
  AssertNoProviderUnions<Surface, Wiring> &
  AssertProvidersComplete<Surface, ProvidersFromWiring<Wiring>, AliasesFromWiring<Wiring>> &
  AssertNoInvalidPinnedLifetimeEdges<
    Surface,
    ProvidersFromWiring<Wiring>,
    AliasesFromWiring<Wiring>
  > &
  AssertParamsCompatible<Surface, ProvidersFromWiring<Wiring>>;

type InferredParamsFor<
  Surface extends Record<string, AnyProvider>,
  Wiring extends readonly WiringEntry[],
> = InferredParams<Surface, ProvidersFromWiring<Wiring>>;

/**
 * Build a precise `wiring` tuple when **extracting** providers out of
 * {@link compose}. Not needed for the usual inline form
 * `compose({ entryBoundaries, surface, wiring: [A, B] })` — that already keeps tuple precision.
 *
 * A plain extracted array widens to `Provider[]` and type-checks as if no
 * private providers were registered (false “Missing provider”). `as const`
 * also works; this helper is the documented extraction path.
 *
 * ```ts
 * // Prefer inline when possible:
 * compose({ entryBoundaries: [Orders], surface: { getOrder }, wiring: [SelectOrderProvider, FindOrderViaPostgres] });
 *
 * // Only if the list must live in a variable/module:
 * const wiring = defineWiring(SelectOrderProvider, aliasIntent(FindOrder, SelectOrder));
 * compose({ entryBoundaries: [Orders], surface: { getOrder }, wiring });
 * ```
 */
export function defineWiring<const Entries extends readonly WiringEntry[]>(
  ...entries: Entries
): Entries {
  return entries;
}

/**
 * Preserve a precise `{ entryBoundaries, surface, wiring? }` bag for later {@link compose}.
 * Prefer writing the object inline at `compose` when you can. Applies the same
 * compile-time graph asserts as `compose` at the definition site. Do not
 * annotate the result as bare {@link ComposeOptions}.
 */
export function defineComposition<
  const Entries extends EntryBoundaries,
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[] = [],
>(
  options: ComposeOptions<Entries, Surface, Wiring> & ComposeAsserts<Entries, Surface, Wiring>
): ComposeOptions<Entries, Surface, Wiring> {
  return options;
}

/**
 * Build a closed Composition: declare exact Entry Boundaries, register surface + wiring (providers and
 * {@link aliasIntent} aliases), resolve `using` deps by identity (and intent-alias rewrite), expose
 * surface aliases on execution contexts, and materialize realizations lazily
 * on first use.
 *
 * Type-level: after intent-alias rewrite, every Intent required by registered
 * providers must have a registered provider (missing → compile error). Keys are
 * structured `(boundaryId, intentName)`, not concatenated labels.
 * Runtime: duplicate Intent within `surface` or within wiring providers, same
 * Intent in both, duplicate Intent alias for one Required Intent, or provider +
 * intent alias for the same Required Intent, throws. Surface aliases must be strings
 * and must not use reserved names (`dispose`, `surface`, `__proto__`). Homonymous
 * Boundaries and repeated Intent declarations share one identity. After
 * registration, builds an execution plan, rejects cycles / open graphs, and derives
 * effective Provider lifetimes before returning the root (runtime `seeing` remains
 * defense-in-depth only). `auto` Providers narrow transitively to context ownership;
 * `.perComposition()` is an exact pin. Root and
 * each execution context use an `open | disposing | disposed` lifecycle; Design C
 * paths (`open` / `with` / `AsyncDisposable`) share that machine. Typed execution
 * `params` and `AbortSignal` are accepted via {@link ExecutionContextArgs} on open/with
 * (same args); dispose aborts the scope signal. `.perContext<ParamsReq>()` factories
 * read `params` on {@link WithContext} (not {@link Lifetime}). Provider factories may
 * return an `Awaitable` operation: materialization uses a local Lifetime bucket (commit
 * on success, immediate rollback on failure; failed attempts are not cached; concurrent
 * callers coalesce on one inflight promise). `root.dispose()` is the backstop that
 * closes open contexts then composition-lifetime cleanups.
 *
 * Params typing: `compose({ … })` **infers** required params from all Providers'
 * `.perContext<ParamsReq>()` declarations (merge / conflict check). open/with then
 * require `{ params }` when the merge is non-void. `compose<Explicit>()({ … })` is only
 * for an explicit **superset** of that inferred bag. Prefer an inline options literal;
 * if wiring is extracted, use {@link defineWiring} (or `as const`). Annotating a config
 * as {@link ComposeOptions} widens types and is a footgun. Provider unions in a surface
 * alias or wiring slot are rejected.
 */
export function compose<ExplicitParams>(): <
  const Entries extends EntryBoundaries,
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[] = [],
>(
  options: ComposeOptions<Entries, Surface, Wiring> &
    ComposeAsserts<Entries, Surface, Wiring> &
    AssertExplicitParamsCover<ExplicitParams, Surface, ProvidersFromWiring<Wiring>>
) => CompositionRoot<Surface, ExplicitParams>;
export function compose<
  const Entries extends EntryBoundaries,
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[] = [],
>(
  options: ComposeOptions<Entries, Surface, Wiring> & ComposeAsserts<Entries, Surface, Wiring>
): CompositionRoot<Surface, InferredParamsFor<Surface, Wiring>>;
export function compose<
  const Entries extends EntryBoundaries,
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[] = [],
>(
  options?: ComposeOptions<Entries, Surface, Wiring> & ComposeAsserts<Entries, Surface, Wiring>
):
  | CompositionRoot<Surface, InferredParamsFor<Surface, Wiring>>
  | (<
      const E extends EntryBoundaries,
      S extends Record<string, AnyProvider>,
      const W extends readonly WiringEntry[] = [],
    >(
      opts: ComposeOptions<E, S, W> &
        ComposeAsserts<E, S, W> &
        AssertExplicitParamsCover<unknown, S, ProvidersFromWiring<W>>
    ) => CompositionRoot<S, unknown>) {
  if (options === undefined) {
    return ((opts) => composeImpl(opts)) as <
      const E extends EntryBoundaries,
      S extends Record<string, AnyProvider>,
      const W extends readonly WiringEntry[] = [],
    >(
      opts: ComposeOptions<E, S, W> &
        ComposeAsserts<E, S, W> &
        AssertExplicitParamsCover<unknown, S, ProvidersFromWiring<W>>
    ) => CompositionRoot<S, unknown>;
  }
  return composeImpl(options);
}

function composeImpl<
  const Entries extends EntryBoundaries,
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[],
  Params = InferredParamsFor<Surface, Wiring>,
>(
  options: ComposeOptions<Entries, Surface, Wiring> & ComposeAsserts<Entries, Surface, Wiring>
): CompositionRoot<Surface, Params> {
  const compiled = compileComposition(options);
  return createCompositionRoot(compiled);
}
