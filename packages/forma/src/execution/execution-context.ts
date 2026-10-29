import type { AnyIntent, AnyProvider } from "../alias-intent.js";
import type {
  ExecutionContext,
  ExecutionContextArgs,
  ExecutionSurface,
} from "../composition/composition-contract.js";
import type { ProviderLifetimePlan } from "../graph-plan.js";
import { intentLabel, intentMapKey } from "../intent-keys.js";
import type { Disposable, IntentOperation, ResolvedDeps } from "../provider.js";
import {
  createMaterializationLifetime,
  createScopeAbort,
  createScopeLifecycle,
  runDisposers,
  type ScopeLifecycle,
  throwAfterCallbackAndCleanup,
  throwAfterFactoryAndRollback,
} from "../scope-lifecycle.js";

type Awaitable<T> = T | PromiseLike<T>;
type Op = IntentOperation<unknown, unknown, unknown>;

function freezeParams<Params>(params: Params): Readonly<Params> {
  if (Array.isArray(params)) {
    return Object.freeze([...params]) as unknown as Readonly<Params>;
  }
  if (params !== null && typeof params === "object") {
    return Object.freeze({ ...(params as object) }) as unknown as Readonly<Params>;
  }
  return params as Readonly<Params>;
}

/** Shared composition-owned materialization state used by every open context. */
export type CompositionOwnedState = {
  readonly registry: ReadonlyMap<string, AnyProvider>;
  readonly aliasMap: ReadonlyMap<string, string>;
  readonly lifetimePlan: ProviderLifetimePlan;
  readonly surfaceEntries: readonly (readonly [string, AnyProvider])[];
  readonly compositionOps: Map<string, Op>;
  readonly compositionInflight: Map<string, Promise<Op>>;
  readonly compositionDisposers: Disposable[];
  readonly rootLife: ScopeLifecycle;
  readonly rootAbort: { readonly signal: AbortSignal };
  readonly openContexts: Set<{ dispose(): Promise<void> }>;
};

/**
 * Open an owned execution context against a live composition root.
 * Caller must `dispose` / `await using`. Prefer {@link runWithExecutionContext}
 * for short lexical scopes.
 */
export function openExecutionContext<Surface extends Record<string, AnyProvider>, Params = void>(
  owned: CompositionOwnedState,
  ...args: ExecutionContextArgs<Params>
): ExecutionContext<Surface, Params> {
  owned.rootLife.assertOpen();

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
          owned.openContexts.delete(contextHandle);
        }
      });
    },
  };
  owned.openContexts.add(contextHandle);

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
    const lifetime = owned.lifetimePlan.get(id);
    if (!lifetime) {
      throw new Error(`Internal error: missing lifetime resolution for ${label}`);
    }

    const effectivePerContext = lifetime.effective === "context";
    const declaredPerContext = provider.lifetimePolicy === "context";
    const owner = effectivePerContext ? contextLife : owned.rootLife;
    const ownerSignal = effectivePerContext ? contextAbort.signal : owned.rootAbort.signal;
    const cache = effectivePerContext ? contextOps : owned.compositionOps;
    const inflight = effectivePerContext ? contextInflight : owned.compositionInflight;
    const disposers = effectivePerContext ? contextDisposers : owned.compositionDisposers;

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
    const satisfierId = owned.aliasMap.get(requiredId) ?? requiredId;
    const provider = owned.registry.get(satisfierId);
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
  for (const [alias, provider] of owned.surfaceEntries) {
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

/**
 * Safe default for short scopes: open → run with a borrowed surface → dispose.
 * See error matrix: both failures → `SuppressedError(cleanup, callback)`.
 */
export async function runWithExecutionContext<
  Surface extends Record<string, AnyProvider>,
  Params,
  T,
>(
  owned: CompositionOwnedState,
  run: (surface: ExecutionSurface<Surface>) => Awaitable<T>,
  ...args: ExecutionContextArgs<Params>
): Promise<Awaited<T>> {
  const execution = openExecutionContext<Surface, Params>(owned, ...args);
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
