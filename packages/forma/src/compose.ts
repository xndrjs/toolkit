import type { Intent } from "./boundary.js";
import type { Disposable, IntentOperation, Lifetime, Provider, ResolvedDeps } from "./provider.js";
import type { Result } from "./result.js";

/**
 * Registrable Provider with erased contract params so `compose` can accept a
 * heterogeneous `surface` / `wiring` list. Concrete Providers remain fully typed at aliases.
 */
// Type params appear in covariant and contravariant positions; erasure needs `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AnyProvider erasure
type AnyProvider = Provider<string, string, any, any, any, any, boolean>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AnyIntent erasure for bindings
type AnyIntent = Intent<string, string, any, any, any>;

type SurfaceOperation<P> =
  // Deps is invariant on Provider (factory param); erase with `any` so surface
  // aliases still expose Input/Success/Err when the provider has `using` deps.
  // Context aliases always return a Promise (lazy materialize + invoke).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Deps erasure
  P extends Provider<string, string, infer Input, infer Success, infer Err, any, boolean>
    ? (input: Input) => Promise<Result<Success, Err>>
    : never;

type Op = IntentOperation<unknown, unknown, unknown>;

declare const formaBindingBrand: unique symbol;

/**
 * Explicit composition association produced only by {@link bind}.
 * Preserves concrete Intent types so `compose` can rewrite requirements.
 * Raw `[required, satisfier]` tuples are not assignable (brand).
 */
export type BindingPair<
  Req extends AnyIntent = AnyIntent,
  Sat extends AnyIntent = AnyIntent,
> = readonly [Req, Sat] & {
  readonly [formaBindingBrand]: void;
};

/** Erased binding pair for heterogeneous `wiring` arrays. */
export type Binding = BindingPair;

/** One entry in `compose({ wiring })`: a Provider or a {@link bind} alias. */
export type WiringEntry = AnyProvider | Binding;

/**
 * `Sat` when Req and Sat Intent contracts are mutually assignable
 * (structural equivalence of Input / Success / Err); otherwise `never`.
 */
type SameContract<Req, Sat> =
  Req extends Intent<string, string, infer RI, infer RS, infer RE>
    ? Sat extends Intent<string, string, infer SI, infer SS, infer SE>
      ? [RI, SI] extends [SI, RI]
        ? [RS, SS] extends [SS, RS]
          ? [RE, SE] extends [SE, RE]
            ? Sat
            : never
          : never
        : never
      : never
    : never;

/**
 * Associate a required Intent with a satisfier Intent whose contract is
 * structurally equivalent. Use the result in `compose({ wiring })`.
 *
 * ```ts
 * wiring: [SelectOrderProvider, bind(FindOrder, SelectOrder)]
 * ```
 */
export function bind<Req extends AnyIntent, Sat extends AnyIntent>(
  required: Req,
  satisfier: SameContract<Req, Sat>
): BindingPair<Req, Sat> {
  return [required, satisfier] as unknown as BindingPair<Req, Sat>;
}

/** Runtime partition: {@link bind} pairs are arrays; Providers are objects. */
function isBinding(entry: WiringEntry): entry is Binding {
  return Array.isArray(entry);
}

/** Type-level: Providers from a `wiring` tuple (Bindings dropped). */
type ProvidersFromWiring<W extends readonly WiringEntry[]> = W extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends Binding
    ? Tail extends readonly WiringEntry[]
      ? ProvidersFromWiring<Tail>
      : readonly []
    : Tail extends readonly WiringEntry[]
      ? readonly [Extract<Head, AnyProvider>, ...ProvidersFromWiring<Tail>]
      : readonly [Extract<Head, AnyProvider>]
  : readonly [];

/** Type-level: Bindings from a `wiring` tuple (Providers dropped). */
type BindingsFromWiring<W extends readonly WiringEntry[]> = W extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends Binding
    ? Tail extends readonly WiringEntry[]
      ? readonly [Head, ...BindingsFromWiring<Tail>]
      : readonly [Head]
    : Tail extends readonly WiringEntry[]
      ? BindingsFromWiring<Tail>
      : readonly []
  : readonly [];

function partitionWiring(wiring: readonly WiringEntry[]): {
  providers: AnyProvider[];
  bindings: Binding[];
} {
  const providers: AnyProvider[] = [];
  const bindings: Binding[] = [];
  for (const entry of wiring) {
    if (isBinding(entry)) {
      bindings.push(entry);
    } else {
      providers.push(entry);
    }
  }
  return { providers, bindings };
}

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

/** Stable type-level Intent id: `boundaryId.name`. */
type IntentKeyOf<I> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intent contract erasure
  I extends Intent<infer B, infer N, any, any, any>
    ? `${Extract<B, string>}.${Extract<N, string>}`
    : never;

type ProviderIntentKey<P> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Provider contract erasure
  P extends Provider<infer B, infer N, any, any, any, any, boolean>
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
  P extends Provider<string, string, any, any, any, infer Deps, boolean>
    ? IsEmptyDeps<Deps> extends true
      ? never
      : { [K in keyof Deps]: IntentKeyOf<Deps[K]> }[keyof Deps]
    : never;

/** `true` when the Provider is marked `.perContext()`; otherwise `false`. */
type ProviderIsPerContext<P> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Provider contract erasure
  P extends Provider<string, string, any, any, any, any, infer PC> ? PC : false;

type RegisteredProviders<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
> = Surface[keyof Surface] | Providers[number];

/** Registered provider whose Intent key matches `Key` (after identity resolution). */
type ProviderForIntentKey<
  Key extends string,
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
> =
  RegisteredProviders<Surface, Providers> extends infer P
    ? P extends AnyProvider
      ? [ProviderIntentKey<P>] extends [Key]
        ? P
        : never
      : never
    : never;

/**
 * Intent-key edges where a composition-lifetime provider `using`s a dependency
 * satisfied by a `.perContext()` provider (illegal capture; spec §6 / §15.7).
 */
type InvalidLifetimeEdgeKeys<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
  Bindings extends readonly Binding[],
> =
  RegisteredProviders<Surface, Providers> extends infer Consumer
    ? Consumer extends AnyProvider
      ? [ProviderIsPerContext<Consumer>] extends [true]
        ? never
        : ProviderDepKeys<Consumer> extends infer DepKey
          ? DepKey extends string
            ? RewriteRequirement<DepKey, Bindings> extends infer SatisfierKey
              ? SatisfierKey extends string
                ? ProviderForIntentKey<SatisfierKey, Surface, Providers> extends infer Sat
                  ? Sat extends AnyProvider
                    ? [ProviderIsPerContext<Sat>] extends [true]
                      ? `${ProviderIntentKey<Consumer>}→${SatisfierKey}`
                      : never
                    : never
                  : never
                : never
              : never
            : never
          : never
      : never
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
 * Private keys for type-level compose asserts. Not exported: callers cannot
 * satisfy the phantom by adding a string property (only `@ts-expect-error` / casts).
 */
declare const formaMissingProviders: unique symbol;
declare const formaInvalidLifetimeEdges: unique symbol;

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
          readonly [formaMissingProviders]: `Missing provider for Intent(s): ${Extract<Missing, string>}`;
        }
    : unknown;

/**
 * Intersected into `compose` options: composition-lifetime providers must not
 * depend on `.perContext()` providers (phantom property → compile error).
 */
type AssertNoInvalidLifetimeEdges<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
  Bindings extends readonly Binding[],
> =
  InvalidLifetimeEdgeKeys<Surface, Providers, Bindings> extends infer Bad
    ? [Bad] extends [never]
      ? unknown
      : {
          readonly [formaInvalidLifetimeEdges]: `Invalid lifetime edge(s): composition-lifetime provider(s) depend on .perContext(): ${Extract<Bad, string>}`;
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
  const errors: unknown[] = [];
  for (let i = cleanups.length - 1; i >= 0; i -= 1) {
    try {
      await cleanups[i]!();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "One or more disposers failed");
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
    const id = provider.intent.identity;
    if (surfaceIds.has(id)) {
      throw new Error(
        `Intent ${intentLabel(provider.intent)} is registered more than once in surface`
      );
    }
    surfaceIds.add(id);
  }

  const privateIds = new Set<symbol>();
  for (const provider of privateProviders) {
    const id = provider.intent.identity;
    if (surfaceIds.has(id)) {
      throw new Error(`Intent ${intentLabel(provider.intent)} appears in both surface and wiring`);
    }
    if (privateIds.has(id)) {
      throw new Error(
        `Intent ${intentLabel(provider.intent)} is registered more than once in wiring`
      );
    }
    privateIds.add(id);
  }

  const registeredIds = new Set<symbol>([...surfaceIds, ...privateIds]);
  const boundRequiredIds = new Set<symbol>();
  for (const [required] of bindings) {
    if (registeredIds.has(required.identity)) {
      throw new Error(
        `Ambiguous satisfaction for Intent ${intentLabel(required)}: both a provider and a binding are registered`
      );
    }
    if (boundRequiredIds.has(required.identity)) {
      throw new Error(`Duplicate binding for Intent ${intentLabel(required)}`);
    }
    boundRequiredIds.add(required.identity);
  }
}

/**
 * Build a closed Composition: register surface + wiring (providers and bind
 * aliases), resolve `using` deps by identity (and binding rewrite), expose
 * surface aliases on execution contexts, and materialize realizations lazily
 * on first use.
 *
 * Type-level: after binding rewrite, every Intent required by registered
 * providers must have a registered provider (missing → compile error).
 * Runtime: duplicate Intent within `surface` or within wiring providers, same
 * Intent in both, duplicate Binding for one Required Intent, or provider +
 * binding for the same Required Intent, throws.
 */
export function compose<
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[] = [],
>(
  options: ComposeOptions<Surface, Wiring> &
    AssertProvidersComplete<Surface, ProvidersFromWiring<Wiring>, BindingsFromWiring<Wiring>> &
    AssertNoInvalidLifetimeEdges<Surface, ProvidersFromWiring<Wiring>, BindingsFromWiring<Wiring>>
): CompositionRoot<Surface> {
  const surfaceEntries = Object.entries(options.surface) as [keyof Surface & string, AnyProvider][];
  const { providers: privateProviders, bindings } = partitionWiring(options.wiring ?? []);

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
      let contextDisposed = false;

      /**
       * @param seeing - Intent identities already being materialized on this
       *   resolution chain (cycle detection). Concurrent callers use a fresh
       *   set and wait on `inflight` instead of throwing.
       */
      async function materialize(
        provider: AnyProvider,
        seeing: ReadonlySet<symbol> = new Set()
      ): Promise<Op> {
        if (contextDisposed) {
          throw new Error("Execution context is disposed");
        }

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
            if (contextDisposed) {
              throw new Error("Execution context is disposed");
            }
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
            `No provider registered for Intent ${label}${viaBinding}. Add it to surface or wiring.`
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
          if (!provider.perContext) {
            const satisfierId = bindingMap.get(intent.identity) ?? intent.identity;
            const depProvider = registry.get(satisfierId);
            if (depProvider?.perContext) {
              throw new Error(
                `Invalid lifetime edge: composition-lifetime provider ${intentLabel(provider.intent)} cannot depend on a .perContext() provider (${intentLabel(depProvider.intent)})`
              );
            }
          }
          resolved[key] = await resolveByIdentity(intent, seeing);
        }
        return resolved as ResolvedDeps<AnyProvider["deps"]>;
      }
      const ctx: Record<string, unknown> = {
        async dispose() {
          if (contextDisposed) {
            return;
          }
          contextDisposed = true;
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
