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

export type ComposeOptions<
  Surface extends Record<string, AnyProvider> = Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[] = readonly AnyProvider[],
  Bindings extends readonly Binding[] = readonly Binding[],
> = {
  readonly surface: Surface;
  /** Private providers available for dependency resolution (not on the context). */
  readonly providers?: Providers;
  /**
   * Rewrite a required Intent identity to a different satisfier Intent identity.
   * Satisfier's registered provider must fulfill the requirement (structural match,
   * or an adapter provider whose Intent is the bound satisfier).
   */
  readonly bindings?: Bindings;
};

/** Stable type-level Intent id: `boundaryId.name`. */
type IntentKeyOf<I> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intent contract erasure
  I extends Intent<infer B, infer N, any, any, any>
    ? `${Extract<B, string>}.${Extract<N, string>}`
    : never;

type ProviderIntentKey<P> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Provider contract erasure
  P extends Provider<infer B, infer N, any, any, any, any>
    ? `${Extract<B, string>}.${Extract<N, string>}`
    : never;

type IsEmptyDeps<Deps> = [Deps] extends [Record<string, never>]
  ? [Record<string, never>] extends [Deps]
    ? true
    : false
  : false;

/** Direct `using` Intent keys on a Provider (empty when `using` was omitted). */
type ProviderDepKeys<P> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Provider contract erasure
  P extends Provider<string, string, any, any, any, infer Deps>
    ? IsEmptyDeps<Deps> extends true
      ? never
      : { [K in keyof Deps]: IntentKeyOf<Deps[K]> }[keyof Deps]
    : never;

type RegisteredIntentKeys<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
> =
  | { [K in keyof Surface]: ProviderIntentKey<Surface[K]> }[keyof Surface]
  | (Providers[number] extends infer P
      ? P extends AnyProvider
        ? ProviderIntentKey<P>
        : never
      : never);

type RequiredIntentKeys<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
> =
  | { [K in keyof Surface]: ProviderDepKeys<Surface[K]> }[keyof Surface]
  | (Providers[number] extends infer P
      ? P extends AnyProvider
        ? ProviderDepKeys<P>
        : never
      : never);

type BindingSatisfierFor<
  Required extends string,
  Bindings extends readonly Binding[],
> = Bindings extends readonly [infer Head, ...infer Tail]
  ? Head extends readonly [infer Req, infer Sat]
    ? [IntentKeyOf<Req>] extends [Required]
      ? IntentKeyOf<Sat>
      : Tail extends readonly Binding[]
        ? BindingSatisfierFor<Required, Tail>
        : never
    : never
  : never;

type RewriteRequirement<Required extends string, Bindings extends readonly Binding[]> =
  BindingSatisfierFor<Required, Bindings> extends infer Sat
    ? [Sat] extends [never]
      ? Required
      : Sat & string
    : Required;

type RewriteAllRequirements<Required, Bindings extends readonly Binding[]> = Required extends string
  ? RewriteRequirement<Required, Bindings>
  : never;

/**
 * Intent keys required by registered providers after binding rewrite that still
 * have no registered provider (PoC: missing-provider exhaustiveness).
 */
type MissingProviderKeys<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
  Bindings extends readonly Binding[],
> = Exclude<
  RewriteAllRequirements<RequiredIntentKeys<Surface, Providers>, Bindings>,
  RegisteredIntentKeys<Surface, Providers>
>;

/**
 * Intersected into `compose` options: when the graph is incomplete, requires a
 * phantom property so the call is a compile error (use `@ts-expect-error` in tests).
 */
type AssertProvidersComplete<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
  Bindings extends readonly Binding[],
> =
  MissingProviderKeys<Surface, Providers, Bindings> extends infer Missing
    ? [Missing] extends [never]
      ? unknown
      : {
          readonly __formaMissingProviders: `Missing provider for Intent(s): ${Extract<Missing, string>}`;
        }
    : unknown;

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

function intentLabel(intent: AnyIntent): string {
  return `${intent.boundaryId}.${intent.name}`;
}

/**
 * Fail loud on duplicate / ambiguous registration (compile-time may not catch these yet).
 */
function assertRegistrationSafety(
  surfaceProviders: readonly AnyProvider[],
  privateProviders: readonly AnyProvider[],
  bindings: readonly Binding[]
): void {
  const surfaceIds = new Set<symbol>();
  for (const provider of surfaceProviders) {
    surfaceIds.add(provider.intent.identity);
  }

  const privateIds = new Set<symbol>();
  for (const provider of privateProviders) {
    const id = provider.intent.identity;
    if (surfaceIds.has(id)) {
      throw new Error(
        `Intent ${intentLabel(provider.intent)} appears in both surface and providers`
      );
    }
    privateIds.add(id);
  }

  const registeredIds = new Set<symbol>([...surfaceIds, ...privateIds]);
  for (const [required] of bindings) {
    if (registeredIds.has(required.identity)) {
      throw new Error(
        `Ambiguous satisfaction for Intent ${intentLabel(required)}: both a provider and a binding are registered`
      );
    }
  }
}

/**
 * Build a closed Composition: register surface + private providers, resolve
 * `using` deps by identity (and explicit bindings), expose surface aliases on
 * execution contexts, and materialize realizations lazily on first use.
 *
 * Type-level: after binding rewrite, every Intent required by registered
 * providers must have a registered provider (missing → compile error).
 * Runtime: same Intent in `surface` and `providers`, or provider + binding for
 * the same Required Intent, throws.
 */
export function compose<
  Surface extends Record<string, AnyProvider>,
  const Providers extends readonly AnyProvider[] = [],
  const Bindings extends readonly Binding[] = [],
>(
  options: ComposeOptions<Surface, Providers, Bindings> &
    AssertProvidersComplete<Surface, Providers, Bindings>
): CompositionRoot<Surface> {
  const surfaceEntries = Object.entries(options.surface) as [keyof Surface & string, AnyProvider][];
  const privateProviders = options.providers ?? [];
  const bindings = options.bindings ?? [];

  assertRegistrationSafety(
    surfaceEntries.map(([, p]) => p),
    privateProviders,
    bindings
  );

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
