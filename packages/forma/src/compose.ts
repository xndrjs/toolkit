import type { Intent } from "./boundary.js";
import type { IntentOperation, Provider, ResolvedDeps } from "./provider.js";

/**
 * Registrable Provider with erased contract params so `compose` can accept a
 * heterogeneous `surface` map. Concrete Providers remain fully typed at aliases.
 */
// Type params appear in covariant and contravariant positions; erasure needs `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AnyProvider erasure
type AnyProvider = Provider<string, string, any, any, any, any>;

type SurfaceOperation<P> =
  P extends Provider<string, string, infer Input, infer Success, infer Err, unknown>
    ? IntentOperation<Input, Success, Err>
    : never;

type Op = IntentOperation<unknown, unknown, unknown>;

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
};

/**
 * Build a closed Composition: register surface providers, expose aliases on
 * execution contexts, and materialize realizations lazily on first use.
 *
 * Ticket 03: surface only (no private providers / bindings yet).
 */
export function compose<Surface extends Record<string, AnyProvider>>(
  options: ComposeOptions<Surface>
): CompositionRoot<Surface> {
  const surfaceEntries = Object.entries(options.surface) as [keyof Surface & string, AnyProvider][];

  /** Shared by default (composition-lifetime) providers. */
  const compositionOps = new Map<symbol, Op>();

  return {
    createExecutionContext(): ExecutionContext<Surface> {
      /** Owned by this execution context (`.perContext()` providers). */
      const contextOps = new Map<symbol, Op>();

      function materialize(provider: AnyProvider): Op {
        const cache = provider.perContext ? contextOps : compositionOps;
        const cached = cache.get(provider.intent.identity);
        if (cached) {
          return cached;
        }

        // Ticket 03: surface providers have no `using` deps. Ticket 04 resolves the graph.
        const op = provider.factory(resolveDeps(provider)) as Op;
        cache.set(provider.intent.identity, op);
        return op;
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

function resolveDeps(provider: AnyProvider): ResolvedDeps<AnyProvider["deps"]> {
  const depEntries = Object.entries(
    provider.deps as Record<string, Intent<string, string, unknown, unknown, unknown>>
  );
  if (depEntries.length === 0) {
    return {} as ResolvedDeps<AnyProvider["deps"]>;
  }

  // Private providers / bindings are ticket 04+. Surface-only compositions must not need them.
  const names = depEntries.map(([key, intent]) => `${key}→${intent.boundaryId}.${intent.name}`);
  throw new Error(
    `Composition cannot resolve dependencies yet (${names.join(", ")}). Register private providers (ticket 04) or bindings (ticket 05).`
  );
}
