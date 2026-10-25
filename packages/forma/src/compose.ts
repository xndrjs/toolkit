import type { Intent } from "./boundary.js";
import type { Disposable, IntentOperation, Lifetime, Provider, ResolvedDeps } from "./provider.js";

/**
 * Registrable Provider with erased contract params so `compose` can accept a
 * heterogeneous `surface` / `providers` map. Concrete Providers remain fully typed at aliases.
 */
// Type params appear in covariant and contravariant positions; erasure needs `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AnyProvider erasure
type AnyProvider = Provider<string, string, any, any, any, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AnyIntent erasure for bindings
type AnyIntent = Intent<string, string, any, any, any>;

type SurfaceOperation<P> =
  // Deps is invariant on Provider (factory param); erase with `any` so surface
  // aliases still expose Input/Success/Err when the provider has `using` deps.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Deps erasure
  P extends Provider<string, string, infer Input, infer Success, infer Err, any>
    ? IntentOperation<Input, Success, Err>
    : never;

type Op = IntentOperation<unknown, unknown, unknown>;

/** Explicit composition association: require Intent A, satisfy with Intent B's provider. */
export type Binding = readonly [AnyIntent, AnyIntent];

/** Public aliases from `surface`, plus `dispose` for the execution lifetime. */
export type ExecutionContext<Surface extends Record<string, AnyProvider>> = {
  readonly [K in keyof Surface]: SurfaceOperation<Surface[K]>;
} & {
  dispose(): Promise<void>;
};

export type CompositionRoot<Surface extends Record<string, AnyProvider>> = {
  createExecutionContext(): ExecutionContext<Surface>;
  /** Release composition-lifetime resources registered via `Lifetime.onDispose`. */
  dispose(): Promise<void>;
};

export type ComposeOptions<Surface extends Record<string, AnyProvider>> = {
  readonly surface: Surface;
  /** Private providers available for dependency resolution (not on the context). */
  readonly providers?: readonly AnyProvider[];
  /**
   * Rewrite a required Intent identity to a different satisfier Intent identity.
   * Satisfier's registered provider must fulfill the requirement (structural match,
   * or an adapter provider whose Intent is the bound satisfier).
   */
  readonly bindings?: readonly Binding[];
};

function createLifetime(bucket: Disposable[]): Lifetime {
  return {
    onDispose(cleanup: Disposable) {
      bucket.push(cleanup);
    },
  };
}

async function runDisposers(bucket: Disposable[]): Promise<void> {
  const cleanups = bucket.splice(0, bucket.length);
  for (let i = cleanups.length - 1; i >= 0; i -= 1) {
    await cleanups[i]!();
  }
}

/**
 * Build a closed Composition: register surface + private providers, resolve
 * `using` deps by identity (and explicit bindings), expose surface aliases on
 * execution contexts, and materialize realizations lazily on first use.
 */
export function compose<Surface extends Record<string, AnyProvider>>(
  options: ComposeOptions<Surface>
): CompositionRoot<Surface> {
  const surfaceEntries = Object.entries(options.surface) as [keyof Surface & string, AnyProvider][];
  const privateProviders = options.providers ?? [];
  const bindings = options.bindings ?? [];

  const registry = new Map<symbol, AnyProvider>();
  for (const provider of [...surfaceEntries.map(([, p]) => p), ...privateProviders]) {
    registry.set(provider.intent.identity, provider);
  }

  /** Required Intent identity → satisfier Intent identity. */
  const bindingMap = new Map<symbol, symbol>();
  for (const [required, satisfier] of bindings) {
    bindingMap.set(required.identity, satisfier.identity);
  }

  /** Shared by default (composition-lifetime) providers. */
  const compositionOps = new Map<symbol, Op>();
  const compositionInflight = new Map<symbol, Promise<Op>>();
  const compositionDisposers: Disposable[] = [];

  return {
    createExecutionContext(): ExecutionContext<Surface> {
      /** Owned by this execution context (`.perContext()` providers). */
      const contextOps = new Map<symbol, Op>();
      const contextInflight = new Map<symbol, Promise<Op>>();
      const contextDisposers: Disposable[] = [];

      /**
       * @param seeing - Intent identities already being materialized on this
       *   resolution chain (cycle detection). Concurrent callers use a fresh
       *   set and wait on `inflight` instead of throwing.
       */
      async function materialize(
        provider: AnyProvider,
        seeing: ReadonlySet<symbol> = new Set()
      ): Promise<Op> {
        const perContext = provider.perContext;
        const cache = perContext ? contextOps : compositionOps;
        const inflight = perContext ? contextInflight : compositionInflight;
        const disposers = perContext ? contextDisposers : compositionDisposers;
        const id = provider.intent.identity;

        const cached = cache.get(id);
        if (cached) {
          return cached;
        }

        if (seeing.has(id)) {
          throw new Error(
            `Circular dependency while materializing ${provider.intent.boundaryId}.${provider.intent.name}`
          );
        }

        const pending = inflight.get(id);
        if (pending) {
          return pending;
        }

        const nextSeeing = new Set(seeing);
        nextSeeing.add(id);

        const promise = (async (): Promise<Op> => {
          try {
            // Yield so concurrent first-access callers can join this inflight promise
            // before the factory runs (single materialization per lifetime).
            await Promise.resolve();
            const deps = await resolveDeps(provider, nextSeeing);
            const lifetime = createLifetime(disposers);
            const op = provider.factory(deps, lifetime) as Op;
            cache.set(id, op);
            return op;
          } finally {
            inflight.delete(id);
          }
        })();

        inflight.set(id, promise);
        return promise;
      }

      async function resolveByIdentity(
        required: AnyIntent,
        seeing: ReadonlySet<symbol>
      ): Promise<Op> {
        const satisfierId = bindingMap.get(required.identity) ?? required.identity;
        const provider = registry.get(satisfierId);
        if (!provider) {
          const label = `${required.boundaryId}.${required.name}`;
          const viaBinding =
            satisfierId !== required.identity
              ? ` (bound satisfier identity has no registered provider)`
              : "";
          throw new Error(
            `No provider registered for Intent ${label}${viaBinding}. Add it to surface or providers.`
          );
        }
        return materialize(provider, seeing);
      }

      async function resolveDeps(
        provider: AnyProvider,
        seeing: ReadonlySet<symbol>
      ): Promise<ResolvedDeps<AnyProvider["deps"]>> {
        const deps = provider.deps as Record<string, AnyIntent>;
        const resolved: Record<string, Op> = {};
        for (const [key, intent] of Object.entries(deps)) {
          resolved[key] = await resolveByIdentity(intent, seeing);
        }
        return resolved as ResolvedDeps<AnyProvider["deps"]>;
      }
      const ctx: Record<string, unknown> = {
        async dispose() {
          await runDisposers(contextDisposers);
          contextOps.clear();
        },
      };

      for (const [alias, provider] of surfaceEntries) {
        ctx[alias] = async (input: unknown) => {
          const op = await materialize(provider);
          return op(input);
        };
      }

      return ctx as ExecutionContext<Surface>;
    },

    async dispose() {
      await runDisposers(compositionDisposers);
      compositionOps.clear();
    },
  };
}
