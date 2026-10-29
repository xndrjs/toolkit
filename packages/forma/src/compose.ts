import {
  type AnyIntent,
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
  AssertNoInvalidPinnedLifetimeEdges,
  AssertNoProviderUnions,
  AssertParamsCompatible,
  AssertProvidersComplete,
  AssertSurfaceAliasesSafe,
  InferredParams,
} from "./compose-graph-types.js";
import {
  compileComposition,
  type CompositionPlanDescription,
  type ProviderLifetimeDescription,
} from "./composition/compile-composition.js";
import { intentLabel, intentMapKey } from "./intent-keys.js";
import type {
  Disposable,
  IntentOperation,
  LifetimePolicy,
  Provider,
  ResolvedDeps,
} from "./provider.js";
import type { Result } from "./result.js";
import {
  collectThrown,
  createMaterializationLifetime,
  createScopeAbort,
  createScopeLifecycle,
  runDisposers,
  throwAfterCallbackAndCleanup,
  throwAfterFactoryAndRollback,
  throwIfDisposerErrors,
} from "./scope-lifecycle.js";

export { aliasIntent };
export type { IntentAlias, IntentAliasPair, WiringEntry };
export type { CompositionPlanDescription, ProviderLifetimeDescription };

type Awaitable<T> = T | PromiseLike<T>;

type SurfaceOperation<P> =
  // Deps is invariant on Provider (factory param); erase with `any` so surface
  // aliases still expose Input/Success/Err when the provider has `using` deps.
  // Context aliases always return a Promise (lazy materialize + invoke).
  P extends Provider<
    string,
    string,
    infer Input,
    infer Success,
    infer Err,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Deps erasure
    any,
    LifetimePolicy,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Params erasure
    any
  >
    ? (input: Input) => Promise<Result<Success, Err>>
    : never;

type Op = IntentOperation<unknown, unknown, unknown>;

/**
 * Borrowed public aliases from `compose({ surface })`.
 * Lifecycle controls (`dispose`, AsyncDisposable) stay on the execution handle.
 */
export type ExecutionSurface<Surface extends Record<string, AnyProvider>> = {
  readonly [K in Exclude<keyof Surface & string, "dispose" | "surface">]: SurfaceOperation<
    Surface[K]
  >;
};

/** Options bag for {@link CompositionRoot.openExecutionContext} / {@link CompositionRoot.withExecutionContext}. */
export type ExecutionContextOptions<Params = void> = [Params] extends [void]
  ? { readonly params?: undefined; readonly signal?: AbortSignal }
  : { readonly params: Params; readonly signal?: AbortSignal };

/**
 * Shared rest-args for open/with: no bag required when `Params` is `void`;
 * otherwise `{ params, signal? }` is required.
 */
export type ExecutionContextArgs<Params = void> = [Params] extends [void]
  ? [] | [options?: ExecutionContextOptions<Params>]
  : [options: ExecutionContextOptions<Params>];

/**
 * Owned execution lifetime: nested {@link ExecutionSurface} plus dispose controls.
 * Prefer {@link CompositionRoot.withExecutionContext} for short scopes.
 */
export type ExecutionContext<Surface extends Record<string, AnyProvider>, Params = void> = {
  readonly surface: ExecutionSurface<Surface>;
  /** Scope signal; aborted when this context enters `disposing` (and if a host signal aborts). */
  readonly signal: AbortSignal;
  readonly params: [Params] extends [void] ? undefined : Readonly<Params>;
  /**
   * Release resources whose effective lifetime belongs to this context.
   * Concurrent callers share one dispose promise; terminal after settle.
   */
  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

export type CompositionRoot<Surface extends Record<string, AnyProvider>, Params = void> = {
  /** Explain declared and effective Provider lifetimes for diagnostics and tests. */
  describePlan(): CompositionPlanDescription;
  /**
   * Open an owned execution context. Caller must `dispose` / `await using`.
   * Prefer {@link withExecutionContext} for short lexical scopes.
   */
  openExecutionContext(...options: ExecutionContextArgs<Params>): ExecutionContext<Surface, Params>;
  /**
   * @deprecated Use {@link CompositionRoot.openExecutionContext}.
   */
  createExecutionContext(
    ...options: ExecutionContextArgs<Params>
  ): ExecutionContext<Surface, Params>;
  /**
   * Safe default for short scopes: open → run with a borrowed surface → dispose.
   * See error matrix: both failures → `SuppressedError(cleanup, callback)`.
   */
  withExecutionContext<T>(
    run: (surface: ExecutionSurface<Surface>) => Awaitable<T>,
    ...options: ExecutionContextArgs<Params>
  ): Promise<Awaited<T>>;
  /**
   * Terminal composition shutdown (backstop): refuse new contexts, dispose every
   * open execution context, then run root-owned cleanups. Concurrent
   * callers share one dispose promise; state becomes `disposed` even when a
   * cleanup fails.
   */
  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

/**
 * Shape of `compose({ surface, wiring? })`.
 *
 * **Do not annotate concrete configs as `ComposeOptions`.** The default type
 * parameters widen Surface and Wiring to erased Providers, which disables
 * missing-provider / lifetime / Provider-union checks and autocomplete.
 * Prefer an inferred inline object literal. Use {@link defineWiring} /
 * {@link defineComposition} only when extracting wiring or the options bag.
 */
export type ComposeOptions<
  Surface extends Record<string, AnyProvider> = Record<string, AnyProvider>,
  Wiring extends readonly WiringEntry[] = readonly WiringEntry[],
> = {
  readonly surface: Surface;
  /**
   * Private providers and {@link aliasIntent} aliases for dependency resolution.
   * Providers here are not on the context; intent aliases rewrite required Intent identity
   * to a satisfier whose provider is registered (surface or wiring).
   * Prefer an inline `wiring: […]` tuple at `compose`. Use {@link defineWiring}
   * only when extracting this array so the tuple stays precise.
   * Prefer Adapter / Provider passthrough over {@link aliasIntent} for cross-boundary wiring.
   */
  readonly wiring?: Wiring;
};

type ComposeAsserts<
  Surface extends Record<string, AnyProvider>,
  Wiring extends readonly WiringEntry[],
> = AssertSurfaceAliasesSafe<Surface> &
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
 * `compose({ surface, wiring: [A, B] })` — that already keeps tuple precision.
 *
 * A plain extracted array widens to `Provider[]` and type-checks as if no
 * private providers were registered (false “Missing provider”). `as const`
 * also works; this helper is the documented extraction path.
 *
 * ```ts
 * // Prefer inline when possible:
 * compose({ surface: { getOrder }, wiring: [SelectOrderProvider, FindOrderViaPostgres] });
 *
 * // Only if the list must live in a variable/module:
 * const wiring = defineWiring(SelectOrderProvider, aliasIntent(FindOrder, SelectOrder));
 * compose({ surface: { getOrder }, wiring });
 * ```
 */
export function defineWiring<const Entries extends readonly WiringEntry[]>(
  ...entries: Entries
): Entries {
  return entries;
}

/**
 * Preserve a precise `{ surface, wiring? }` bag for later {@link compose}.
 * Prefer writing the object inline at `compose` when you can. Applies the same
 * compile-time graph asserts as `compose` at the definition site. Do not
 * annotate the result as bare {@link ComposeOptions}.
 */
export function defineComposition<
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[] = [],
>(
  options: ComposeOptions<Surface, Wiring> & ComposeAsserts<Surface, Wiring>
): ComposeOptions<Surface, Wiring> {
  return options;
}

function freezeParams<Params>(params: Params): Readonly<Params> {
  if (Array.isArray(params)) {
    return Object.freeze([...params]) as unknown as Readonly<Params>;
  }
  if (params !== null && typeof params === "object") {
    return Object.freeze({ ...(params as object) }) as unknown as Readonly<Params>;
  }
  return params as Readonly<Params>;
}

/**
 * Build a closed Composition: register surface + wiring (providers and
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
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[] = [],
>(
  options: ComposeOptions<Surface, Wiring> &
    ComposeAsserts<Surface, Wiring> &
    AssertExplicitParamsCover<ExplicitParams, Surface, ProvidersFromWiring<Wiring>>
) => CompositionRoot<Surface, ExplicitParams>;
export function compose<
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[] = [],
>(
  options: ComposeOptions<Surface, Wiring> & ComposeAsserts<Surface, Wiring>
): CompositionRoot<Surface, InferredParamsFor<Surface, Wiring>>;
export function compose<
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[] = [],
>(
  options?: ComposeOptions<Surface, Wiring> & ComposeAsserts<Surface, Wiring>
):
  | CompositionRoot<Surface, InferredParamsFor<Surface, Wiring>>
  | (<S extends Record<string, AnyProvider>, const W extends readonly WiringEntry[] = []>(
      opts: ComposeOptions<S, W> &
        ComposeAsserts<S, W> &
        AssertExplicitParamsCover<unknown, S, ProvidersFromWiring<W>>
    ) => CompositionRoot<S, unknown>) {
  if (options === undefined) {
    return ((opts) => composeImpl(opts)) as <
      S extends Record<string, AnyProvider>,
      const W extends readonly WiringEntry[] = [],
    >(
      opts: ComposeOptions<S, W> &
        ComposeAsserts<S, W> &
        AssertExplicitParamsCover<unknown, S, ProvidersFromWiring<W>>
    ) => CompositionRoot<S, unknown>;
  }
  return composeImpl(options);
}

function composeImpl<
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[],
  Params = InferredParamsFor<Surface, Wiring>,
>(
  options: ComposeOptions<Surface, Wiring> & ComposeAsserts<Surface, Wiring>
): CompositionRoot<Surface, Params> {
  const { registry, aliasMap, lifetimePlan, planDescription, surfaceEntries } =
    compileComposition(options);

  /** Providers whose effective lifetime is composition — owned by the root scope. */
  const compositionOps = new Map<string, Op>();
  const compositionInflight = new Map<string, Promise<Op>>();
  const compositionDisposers: Disposable[] = [];
  const rootLife = createScopeLifecycle("Composition root is disposed");
  const rootAbort = createScopeAbort();
  /** Open execution contexts; root dispose closes them as backstop. */
  const openContexts = new Set<{ dispose(): Promise<void> }>();

  function openExecutionContext(
    ...args: ExecutionContextArgs<Params>
  ): ExecutionContext<Surface, Params> {
    rootLife.assertOpen();

    const openOptions = (args[0] ?? {}) as {
      readonly params?: Params;
      readonly signal?: AbortSignal;
    };
    const contextParams = (
      "params" in openOptions && openOptions.params !== undefined
        ? freezeParams(openOptions.params)
        : undefined
    ) as [Params] extends [void] ? undefined : Readonly<Params>;

    /** Providers whose effective lifetime is context — owned by this execution context. */
    const contextOps = new Map<string, Op>();
    const contextInflight = new Map<string, Promise<Op>>();
    const contextDisposers: Disposable[] = [];
    const contextLife = createScopeLifecycle("Execution context is disposed");
    const contextAbort = createScopeAbort(openOptions.signal);

    const contextHandle = {
      dispose(): Promise<void> {
        contextAbort.abort();
        return contextLife.dispose(async () => {
          try {
            await runDisposers(contextDisposers);
          } finally {
            contextOps.clear();
            openContexts.delete(contextHandle);
          }
        });
      },
    };
    openContexts.add(contextHandle);

    /**
     * @param seeing - Intent identity keys already being materialized on this
     *   resolution chain (defense-in-depth; cycles are rejected at compose).
     * @param path - Display labels for the same chain (error diagnostics).
     */
    async function materialize(
      provider: AnyProvider,
      seeing: ReadonlySet<string> = new Set(),
      path: readonly string[] = []
    ): Promise<Op> {
      const id = intentMapKey(provider.intent);
      const label = intentLabel(provider.intent);
      const lifetime = lifetimePlan.get(id);
      if (!lifetime) {
        throw new Error(`Internal error: missing lifetime resolution for ${label}`);
      }

      const effectivePerContext = lifetime.effective === "context";
      const declaredPerContext = provider.lifetimePolicy === "context";
      const owner = effectivePerContext ? contextLife : rootLife;
      const ownerSignal = effectivePerContext ? contextAbort.signal : rootAbort.signal;
      const cache = effectivePerContext ? contextOps : compositionOps;
      const inflight = effectivePerContext ? contextInflight : compositionInflight;
      const disposers = effectivePerContext ? contextDisposers : compositionDisposers;

      const cached = cache.get(id);
      if (cached) {
        return cached;
      }

      if (seeing.has(id)) {
        throw new Error(`Circular dependency: ${[...path, label].join(" -> ")}`);
      }

      const pending = inflight.get(id);
      if (pending) {
        return pending;
      }

      const nextSeeing = new Set(seeing);
      nextSeeing.add(id);
      const nextPath = [...path, label];

      owner.enter();
      const promise = (async (): Promise<Op> => {
        const setup = createMaterializationLifetime(owner, { signal: ownerSignal });
        try {
          // Yield so concurrent first-access callers can join this inflight promise
          // before the factory runs (single materialization per lifetime).
          await Promise.resolve();
          owner.assertOpen();
          const deps = await resolveDeps(provider, nextSeeing, nextPath);
          owner.assertOpen();
          const produced = provider.factory(
            deps,
            setup.lifetime,
            declaredPerContext ? contextParams : undefined
          );
          const op = await produced;
          owner.assertOpen();
          setup.commit(disposers);
          cache.set(id, op);
          return op;
        } catch (error) {
          // Failed or abandoned setup: rollback local cleanups; do not cache.
          return await throwAfterFactoryAndRollback(error, () => setup.rollback());
        } finally {
          inflight.delete(id);
          owner.leave();
        }
      })();

      inflight.set(id, promise);
      return promise;
    }

    async function resolveByIdentity(
      required: AnyIntent,
      seeing: ReadonlySet<string>,
      path: readonly string[]
    ): Promise<Op> {
      const requiredId = intentMapKey(required);
      const satisfierId = aliasMap.get(requiredId) ?? requiredId;
      const provider = registry.get(satisfierId);
      if (!provider) {
        const viaAlias =
          satisfierId !== requiredId
            ? ` (aliased satisfier identity has no registered provider)`
            : "";
        throw new Error(
          `No provider registered for Intent ${intentLabel(required)}${viaAlias}. Add it to surface or wiring.`
        );
      }
      return materialize(provider, seeing, path);
    }

    async function resolveDeps(
      provider: AnyProvider,
      seeing: ReadonlySet<string>,
      path: readonly string[]
    ): Promise<ResolvedDeps<AnyProvider["deps"]>> {
      const deps = provider.deps as Record<string, AnyIntent>;
      const resolved: Record<string, Op> = {};
      for (const [key, intent] of Object.entries(deps)) {
        resolved[key] = await resolveByIdentity(intent, seeing, path);
      }
      return resolved as ResolvedDeps<AnyProvider["deps"]>;
    }

    const surface = Object.create(null) as Record<string, unknown>;
    for (const [alias, provider] of surfaceEntries) {
      surface[alias] = async (input: unknown) => {
        // Lease on the execution context for the whole surface call (materialize + invoke).
        contextLife.enter();
        try {
          const op = await materialize(provider);
          return await op(input);
        } finally {
          contextLife.leave();
        }
      };
    }

    const dispose = (): Promise<void> => contextHandle.dispose();
    return {
      surface: surface as ExecutionSurface<Surface>,
      signal: contextAbort.signal,
      params: contextParams,
      dispose,
      [Symbol.asyncDispose]: dispose,
    };
  }

  async function withExecutionContext<T>(
    run: (surface: ExecutionSurface<Surface>) => Awaitable<T>,
    ...args: ExecutionContextArgs<Params>
  ): Promise<Awaited<T>> {
    const execution = openExecutionContext(...args);
    let callbackError: unknown | undefined;
    let result: Awaited<T> | undefined;
    try {
      result = await run(execution.surface);
    } catch (error) {
      callbackError = error;
    }

    let cleanupError: unknown | undefined;
    try {
      await execution.dispose();
    } catch (error) {
      cleanupError = error;
    }

    throwAfterCallbackAndCleanup(callbackError, cleanupError);
    return result as Awaited<T>;
  }

  function disposeRoot(): Promise<void> {
    rootAbort.abort();
    return rootLife.dispose(async () => {
      const errors: unknown[] = [];
      const contexts = [...openContexts];
      const contextResults = await Promise.allSettled(contexts.map((c) => c.dispose()));
      for (const result of contextResults) {
        if (result.status === "rejected") {
          collectThrown(result.reason, errors);
        }
      }
      try {
        await runDisposers(compositionDisposers);
      } catch (error) {
        collectThrown(error, errors);
      } finally {
        compositionOps.clear();
      }
      throwIfDisposerErrors(errors);
    });
  }

  return {
    describePlan: () => planDescription,
    openExecutionContext,
    createExecutionContext: openExecutionContext,
    withExecutionContext,
    dispose: disposeRoot,
    [Symbol.asyncDispose]: disposeRoot,
  };
}
