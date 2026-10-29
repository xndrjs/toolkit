import {
  type AnyIntent,
  type AnyProvider,
  type Binding,
  type BindingPair,
  type BindingsFromWiring,
  bind,
  type ProvidersFromWiring,
  partitionWiring,
  type WiringEntry,
} from "./bind.js";
import type {
  AssertNoInvalidLifetimeEdges,
  AssertProvidersComplete,
  AssertSurfaceAliasesSafe,
} from "./compose-graph-types.js";
import { assertAcyclicPlan, assertClosedGraph, buildExecutionPlan } from "./graph-plan.js";
import { intentLabel, intentMapKey } from "./intent-keys.js";
import type { Disposable, IntentOperation, Provider, ResolvedDeps } from "./provider.js";
import { assertRegistrationSafety, buildRegistry } from "./registration.js";
import type { Result } from "./result.js";
import {
  collectThrown,
  createLifetime,
  createScopeLifecycle,
  runDisposers,
  throwIfDisposerErrors,
} from "./scope-lifecycle.js";
import { assertStringRecordKeys } from "./string-keys.js";

export { bind };
export type { Binding, BindingPair, WiringEntry };

type SurfaceOperation<P> =
  // Deps is invariant on Provider (factory param); erase with `any` so surface
  // aliases still expose Input/Success/Err when the provider has `using` deps.
  // Context aliases always return a Promise (lazy materialize + invoke).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Deps erasure
  P extends Provider<string, string, infer Input, infer Success, infer Err, any, boolean>
    ? (input: Input) => Promise<Result<Success, Err>>
    : never;

type Op = IntentOperation<unknown, unknown, unknown>;

/** Public aliases from `surface`, plus `dispose` for the execution lifetime. */
export type ExecutionContext<Surface extends Record<string, AnyProvider>> = {
  readonly [K in Exclude<keyof Surface & string, "dispose">]: SurfaceOperation<Surface[K]>;
} & {
  /**
   * Release `.perContext()` resources for this context.
   * Concurrent callers share one dispose promise; terminal after settle.
   */
  dispose(): Promise<void>;
};

export type CompositionRoot<Surface extends Record<string, AnyProvider>> = {
  createExecutionContext(): ExecutionContext<Surface>;
  /**
   * Terminal composition shutdown (backstop): refuse new contexts, dispose every
   * open execution context, then run composition-lifetime cleanups. Concurrent
   * callers share one dispose promise; state becomes `disposed` even when a
   * cleanup fails.
   */
  dispose(): Promise<void>;
};

export type ComposeOptions<
  Surface extends Record<string, AnyProvider> = Record<string, AnyProvider>,
  Wiring extends readonly WiringEntry[] = readonly WiringEntry[],
> = {
  readonly surface: Surface;
  /**
   * Private providers and {@link bind} aliases for dependency resolution.
   * Providers here are not on the context; bindings rewrite required Intent identity
   * to a satisfier whose provider is registered (surface or wiring).
   */
  readonly wiring?: Wiring;
};

/**
 * Build a closed Composition: register surface + wiring (providers and bind
 * aliases), resolve `using` deps by identity (and binding rewrite), expose
 * surface aliases on execution contexts, and materialize realizations lazily
 * on first use.
 *
 * Type-level: after binding rewrite, every Intent required by registered
 * providers must have a registered provider (missing → compile error). Keys are
 * structured `(boundaryId, intentName)`, not concatenated labels.
 * Runtime: duplicate Intent within `surface` or within wiring providers, same
 * Intent in both, duplicate Binding for one Required Intent, or provider +
 * binding for the same Required Intent, throws. Surface aliases must be strings
 * and must not use reserved names (`dispose`, `__proto__`). Homonymous Boundaries
 * and repeated Intent declarations share one identity. After registration, builds
 * an execution plan and rejects cycles / open graphs before returning the root
 * (runtime `seeing` remains defense-in-depth only). Root and each execution
 * context use an `open | disposing | disposed` lifecycle; `root.dispose()` is
 * the backstop that closes open contexts then composition-lifetime cleanups.
 */
export function compose<
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[] = [],
>(
  options: ComposeOptions<Surface, Wiring> &
    AssertSurfaceAliasesSafe<Surface> &
    AssertProvidersComplete<Surface, ProvidersFromWiring<Wiring>, BindingsFromWiring<Wiring>> &
    AssertNoInvalidLifetimeEdges<Surface, ProvidersFromWiring<Wiring>, BindingsFromWiring<Wiring>>
): CompositionRoot<Surface> {
  assertStringRecordKeys(options.surface, "Surface", { rejectReservedSurface: true });
  const surfaceEntries = Object.entries(options.surface) as [keyof Surface & string, AnyProvider][];
  const { providers: privateProviders, bindings } = partitionWiring(options.wiring ?? []);
  const surfaceProviders = surfaceEntries.map(([, p]) => p);

  assertRegistrationSafety(surfaceProviders, privateProviders, bindings);
  const { registry, bindingMap } = buildRegistry(surfaceProviders, privateProviders, bindings);

  const executionPlan = buildExecutionPlan(registry, bindings);
  assertAcyclicPlan(executionPlan);
  assertClosedGraph(registry, bindings);

  /** Shared by default (composition-lifetime) providers — owned by the root scope. */
  const compositionOps = new Map<string, Op>();
  const compositionInflight = new Map<string, Promise<Op>>();
  const compositionDisposers: Disposable[] = [];
  const rootLife = createScopeLifecycle("Composition root is disposed");
  /** Open execution contexts; root dispose closes them as backstop. */
  const openContexts = new Set<{ dispose(): Promise<void> }>();

  return {
    createExecutionContext(): ExecutionContext<Surface> {
      rootLife.assertOpen();

      /** Owned by this execution context (`.perContext()` providers). */
      const contextOps = new Map<string, Op>();
      const contextInflight = new Map<string, Promise<Op>>();
      const contextDisposers: Disposable[] = [];
      const contextLife = createScopeLifecycle("Execution context is disposed");

      const contextHandle = {
        dispose(): Promise<void> {
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
        const perContext = provider.perContext;
        const owner = perContext ? contextLife : rootLife;
        const cache = perContext ? contextOps : compositionOps;
        const inflight = perContext ? contextInflight : compositionInflight;
        const disposers = perContext ? contextDisposers : compositionDisposers;
        const id = intentMapKey(provider.intent);
        const label = intentLabel(provider.intent);

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
          try {
            // Yield so concurrent first-access callers can join this inflight promise
            // before the factory runs (single materialization per lifetime).
            await Promise.resolve();
            owner.assertOpen();
            const deps = await resolveDeps(provider, nextSeeing, nextPath);
            owner.assertOpen();
            const lifetime = createLifetime(disposers, owner);
            // Await thenables so dispose can drain mid-factory (full async+rollback: later ticket).
            const produced = provider.factory(deps, lifetime) as Op | Promise<Op>;
            const op = await produced;
            owner.assertOpen();
            cache.set(id, op);
            return op;
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
        const satisfierId = bindingMap.get(requiredId) ?? requiredId;
        const provider = registry.get(satisfierId);
        if (!provider) {
          const viaBinding =
            satisfierId !== requiredId
              ? ` (bound satisfier identity has no registered provider)`
              : "";
          throw new Error(
            `No provider registered for Intent ${intentLabel(required)}${viaBinding}. Add it to surface or wiring.`
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
          if (!provider.perContext) {
            const requiredId = intentMapKey(intent);
            const satisfierId = bindingMap.get(requiredId) ?? requiredId;
            const depProvider = registry.get(satisfierId);
            if (depProvider?.perContext) {
              throw new Error(
                `Invalid lifetime edge: composition-lifetime provider ${intentLabel(provider.intent)} cannot depend on a .perContext() provider (${intentLabel(depProvider.intent)})`
              );
            }
          }
          resolved[key] = await resolveByIdentity(intent, seeing, path);
        }
        return resolved as ResolvedDeps<AnyProvider["deps"]>;
      }

      const ctx = Object.create(null) as Record<string, unknown>;
      ctx.dispose = () => contextHandle.dispose();

      for (const [alias, provider] of surfaceEntries) {
        ctx[alias] = async (input: unknown) => {
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

      return ctx as ExecutionContext<Surface>;
    },

    dispose(): Promise<void> {
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
    },
  };
}
