import type { Intent } from "./boundary.js";
import type { IntentOperation, Provider, ResolvedDeps } from "./provider.js";

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

  return {
    createExecutionContext(): ExecutionContext<Surface> {
      /** Owned by this execution context (`.perContext()` providers). */
      const contextOps = new Map<symbol, Op>();
      /** Detect cycles while materializing the `using` graph. */
      const materializing = new Set<symbol>();

      function materialize(provider: AnyProvider): Op {
        const cache = provider.perContext ? contextOps : compositionOps;
        const cached = cache.get(provider.intent.identity);
        if (cached) {
          return cached;
        }

        if (materializing.has(provider.intent.identity)) {
          throw new Error(
            `Circular dependency while materializing ${provider.intent.boundaryId}.${provider.intent.name}`
          );
        }

        materializing.add(provider.intent.identity);
        try {
          const op = provider.factory(resolveDeps(provider)) as Op;
          cache.set(provider.intent.identity, op);
          return op;
        } finally {
          materializing.delete(provider.intent.identity);
        }
      }

      function resolveByIdentity(required: AnyIntent): Op {
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
        return materialize(provider);
      }

      function resolveDeps(provider: AnyProvider): ResolvedDeps<AnyProvider["deps"]> {
        const deps = provider.deps as Record<string, AnyIntent>;
        const resolved: Record<string, Op> = {};
        for (const [key, intent] of Object.entries(deps)) {
          resolved[key] = resolveByIdentity(intent);
        }
        return resolved as ResolvedDeps<AnyProvider["deps"]>;
      }

      const ctx: Record<string, unknown> = {
        async dispose() {
          // No owned resources yet (lifecycle disposal lands in ticket 06).
        },
      };

      for (const [alias, provider] of surfaceEntries) {
        ctx[alias] = (input: unknown) => materialize(provider)(input);
      }

      return ctx as ExecutionContext<Surface>;
    },
  };
}
