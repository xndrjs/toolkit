import type { Intent } from "./boundary.js";
import type { Result } from "./result.js";
import { assertStringRecordKeys, sealedStringRecord } from "./string-keys.js";

/** Operation that fulfills an Intent contract. */
export type IntentOperation<Input, Success, Err> = (
  input: Input
) => Result<Success, Err> | Promise<Result<Success, Err>>;

/** Cleanup registered via `Lifetime.onDispose` during provider materialization. */
export type Disposable = () => void | Promise<void>;

type Awaitable<T> = T | PromiseLike<T>;

/**
 * Materialization-scoped hooks for the current provider instance.
 * Cleanups run on the owner selected by the Composition's effective lifetime plan:
 * execution context for `.perContext()` and narrowed `auto` Providers, root for
 * composition-effective Providers.
 * `onDispose` is only valid during that materialization attempt: after the factory
 * returns (success commits to the owner bucket; failure rolls back locally) or after
 * the owning scope seals, further registration throws.
 *
 * `signal` belongs to the owning scope (execution context or composition root) and
 * aborts when that scope enters `disposing`. Execution `params` are not on Lifetime —
 * they appear on {@link WithContext} for `.perContext()` factories that declared a
 * {@link ParamsObject} requirement.
 */
export type Lifetime = {
  readonly signal: AbortSignal;
  onDispose(cleanup: Disposable): void;
};

/**
 * Host open/with invocation bag declared on `.perContext<P>()`.
 * Object POJO only (nested fields ok); not a bare primitive.
 */
export type ParamsObject = object;

/** `void` or a {@link ParamsObject} (rejects primitives as the bag). */
export type ParamsReq = void | ParamsObject;

/**
 * Local lifetime policy declared by a Provider.
 *
 * - `auto`: use the longest lifetime compatible with the resolved dependency graph.
 * - `context`: always owned by an execution context; may declare {@link ParamsReq}.
 * - `composition`: must stay owned by the composition root or `compose` fails.
 */
export type LifetimePolicy = "auto" | "context" | "composition";

/**
 * Who created this Provider. Discriminated so Boundary and Adapter ids cannot collide.
 * - `Intent.provide…with` → `{ kind: "boundary", id: intent.boundaryId }`
 * - `adapter(id, …).adapt…with` → `{ kind: "adapter", id }`
 */
export type ProviderOrigin =
  | { readonly kind: "boundary"; readonly id: string }
  | { readonly kind: "adapter"; readonly id: string };

/** Reject maps that include symbol (or number) keys — Forma only wires string dependency names. */
type StringKeyedDeps<Deps> = Exclude<keyof Deps, string> extends never ? Deps : never;

/**
 * Map of same-boundary Intents accepted by `using`.
 * Uses a self-referential mapped constraint (no string index) so named keys stay required.
 * Keys are string-only (`Extract<keyof Deps, string>`).
 */
export type SameBoundaryDeps<BoundaryId extends string, Deps> = {
  readonly [K in Extract<keyof Deps, string>]: Deps[K] extends Intent<
    BoundaryId,
    string,
    infer _I,
    infer _S,
    infer _E
  >
    ? Deps[K]
    : Intent<BoundaryId, string, never, never, never>;
};

/**
 * Map of Intents from any boundary accepted by adapter `using`.
 * Same self-referential shape as {@link SameBoundaryDeps}, without a BoundaryId brand.
 */
export type AnyIntentDeps<Deps> = {
  readonly [K in Extract<keyof Deps, string>]: Deps[K] extends Intent<
    string,
    string,
    infer _I,
    infer _S,
    infer _E
  >
    ? Deps[K]
    : Intent<string, string, never, never, never>;
};

/** Resolved operations keyed like the `using` map. */
export type ResolvedDeps<Deps> = {
  readonly [K in Extract<keyof Deps, string>]: Deps[K] extends Intent<
    string,
    string,
    infer I,
    infer S,
    infer E
  >
    ? IntentOperation<I, S, E>
    : never;
};

type EmptyDeps = Record<string, never>;

type IsEmptyDeps<Deps> = [Deps] extends [EmptyDeps]
  ? EmptyDeps extends Deps
    ? true
    : false
  : false;

/**
 * Argument to `.with`: named fields avoid positional ambiguity between deps and lifetime.
 * No `using` → only `lifetime` (+ `params` when `.perContext<ParamsReq>()`).
 * With `using` → `deps` + `lifetime` (+ `params` when declared).
 */
export type WithContext<Deps, Params = void> =
  IsEmptyDeps<Deps> extends true
    ? [Params] extends [void]
      ? { readonly lifetime: Lifetime }
      : { readonly lifetime: Lifetime; readonly params: Readonly<Params> }
    : [Params] extends [void]
      ? { readonly deps: ResolvedDeps<Deps>; readonly lifetime: Lifetime }
      : {
          readonly deps: ResolvedDeps<Deps>;
          readonly lifetime: Lifetime;
          readonly params: Readonly<Params>;
        };

/**
 * Registrable association of an Intent with a realization, dependencies, and lifetime policy.
 * Inspectable in isolation (composition comes later).
 * The Composition derives the effective lifetime from the resolved graph.
 * `Params` is the `.perContext<ParamsReq>()` requirement (`void` when undeclared).
 */
export type Provider<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps = Record<string, never>,
  Policy extends LifetimePolicy = "auto",
  Params = void,
> = {
  readonly intent: Intent<BoundaryId, Name, Input, Success, Err>;
  readonly deps: Deps;
  /** Declared policy; the Composition owns the derived effective lifetime. */
  readonly lifetimePolicy: Policy;
  /** Who created this Provider (`boundary` via `Intent.provide`, or `adapter` via `.adapt`). */
  readonly origin: ProviderOrigin;
  /**
   * Type-only ParamsReq marker (always `undefined` at runtime). Preserves
   * `.perContext<P>()` through object spreads for compose inference.
   */
  readonly $params?: Params;
  /**
   * Internal materialization hook; prefer building via Intent.provide.with.
   * `params` is the frozen host bag for `.perContext()` materializations (undefined otherwise).
   */
  readonly factory: (
    deps: ResolvedDeps<Deps>,
    lifetime: Lifetime,
    params?: unknown
  ) => Awaitable<IntentOperation<Input, Success, Err>>;
};

type WithFactory<Input, Success, Err, Deps, Params> = (
  ctx: WithContext<Deps, Params>
) => Awaitable<IntentOperation<Input, Success, Err>>;

/** Fluent steps after deps are fixed (`using` is one-shot). */
type ProviderBuilderAfterUsing<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps,
  Policy extends LifetimePolicy,
  Params,
> = {
  with(
    factory: WithFactory<Input, Success, Err, Deps, Params>
  ): Provider<BoundaryId, Name, Input, Success, Err, Deps, Policy, Params>;
} & (Policy extends "auto"
  ? {
      perContext<P extends ParamsReq = void>(): ProviderBuilderAfterUsing<
        BoundaryId,
        Name,
        Input,
        Success,
        Err,
        Deps,
        "context",
        P
      >;
      perComposition(): ProviderBuilderAfterUsing<
        BoundaryId,
        Name,
        Input,
        Success,
        Err,
        Deps,
        "composition",
        void
      >;
    }
  : Record<never, never>);

/** Fluent steps after deps are fixed on the Adapter path (`using` is one-shot). */
type AdaptProviderBuilderAfterUsing<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps,
  Policy extends LifetimePolicy,
  Params,
> = {
  with(
    factory: WithFactory<Input, Success, Err, Deps, Params>
  ): Provider<BoundaryId, Name, Input, Success, Err, Deps, Policy, Params>;
} & (Policy extends "auto"
  ? {
      perContext<P extends ParamsReq = void>(): AdaptProviderBuilderAfterUsing<
        BoundaryId,
        Name,
        Input,
        Success,
        Err,
        Deps,
        "context",
        P
      >;
      perComposition(): AdaptProviderBuilderAfterUsing<
        BoundaryId,
        Name,
        Input,
        Success,
        Err,
        Deps,
        "composition",
        void
      >;
    }
  : Record<never, never>);

/** Builder for `Intent.provide`: `using` accepts only same-boundary Intents; one-shot. */
export type ProviderBuilder<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps = EmptyDeps,
  Policy extends LifetimePolicy = "auto",
  Params = void,
> = (IsEmptyDeps<Deps> extends true
  ? {
      using<NewDeps extends SameBoundaryDeps<BoundaryId, NewDeps>>(
        deps: StringKeyedDeps<NewDeps> & SameBoundaryDeps<BoundaryId, NewDeps>
      ): ProviderBuilderAfterUsing<BoundaryId, Name, Input, Success, Err, NewDeps, Policy, Params>;
      with(
        factory: WithFactory<Input, Success, Err, EmptyDeps, Params>
      ): Provider<BoundaryId, Name, Input, Success, Err, EmptyDeps, Policy, Params>;
    }
  : ProviderBuilderAfterUsing<BoundaryId, Name, Input, Success, Err, Deps, Policy, Params>) &
  (Policy extends "auto"
    ? {
        perContext<P extends ParamsReq = void>(): ProviderBuilder<
          BoundaryId,
          Name,
          Input,
          Success,
          Err,
          Deps,
          "context",
          P
        >;
        perComposition(): ProviderBuilder<
          BoundaryId,
          Name,
          Input,
          Success,
          Err,
          Deps,
          "composition",
          void
        >;
      }
    : Record<never, never>);

/** Builder for `adapter().adapt`: `using` accepts Intents from any boundary; one-shot. */
export type AdaptProviderBuilder<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps = EmptyDeps,
  Policy extends LifetimePolicy = "auto",
  Params = void,
> = (IsEmptyDeps<Deps> extends true
  ? {
      using<NewDeps extends AnyIntentDeps<NewDeps>>(
        deps: StringKeyedDeps<NewDeps> & AnyIntentDeps<NewDeps>
      ): AdaptProviderBuilderAfterUsing<
        BoundaryId,
        Name,
        Input,
        Success,
        Err,
        NewDeps,
        Policy,
        Params
      >;
      with(
        factory: WithFactory<Input, Success, Err, EmptyDeps, Params>
      ): Provider<BoundaryId, Name, Input, Success, Err, EmptyDeps, Policy, Params>;
    }
  : AdaptProviderBuilderAfterUsing<BoundaryId, Name, Input, Success, Err, Deps, Policy, Params>) &
  (Policy extends "auto"
    ? {
        perContext<P extends ParamsReq = void>(): AdaptProviderBuilder<
          BoundaryId,
          Name,
          Input,
          Success,
          Err,
          Deps,
          "context",
          P
        >;
        perComposition(): AdaptProviderBuilder<
          BoundaryId,
          Name,
          Input,
          Success,
          Err,
          Deps,
          "composition",
          void
        >;
      }
    : Record<never, never>);

export type ProvideApi<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
> = ProviderBuilder<BoundaryId, Name, Input, Success, Err>;

export type AdaptProvideApi<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
> = AdaptProviderBuilder<BoundaryId, Name, Input, Success, Err>;

/**
 * Shared fluent implementation. Callers pick the public builder type
 * (`ProviderBuilder` vs `AdaptProviderBuilder`); `using` constraints are type-only.
 * `using` is one-shot: a second call throws at runtime and is absent from the type.
 */
function createProviderBuilder<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps,
  Policy extends LifetimePolicy,
  Params,
>(
  intent: Intent<BoundaryId, Name, Input, Success, Err>,
  deps: Deps,
  lifetimePolicy: Policy,
  origin: ProviderOrigin
) {
  const hasDeps = Reflect.ownKeys(deps as object).length > 0;

  return {
    using(newDeps: object) {
      if (hasDeps) {
        throw new Error(
          "using() can only be called once; put all dependencies in a single using({ ... }) call"
        );
      }
      assertStringRecordKeys(newDeps, "Provider using()");
      return createProviderBuilder(intent, sealedStringRecord(newDeps), lifetimePolicy, origin);
    },
    perContext() {
      // Type param P is erased; runtime forwards the host bag into perContext
      // factories when present; types gate `ctx.params` via Params / $params.
      return createProviderBuilder(intent, deps, "context" as const, origin);
    },
    perComposition() {
      return createProviderBuilder(intent, deps, "composition" as const, origin);
    },
    with(factory: WithFactory<Input, Success, Err, Deps, Params>) {
      return {
        intent,
        deps,
        lifetimePolicy,
        origin,
        $params: undefined as Params | undefined,
        factory: (resolved: ResolvedDeps<Deps>, lifetime: Lifetime, params?: unknown) => {
          const base = hasDeps ? { deps: resolved, lifetime } : { lifetime };
          const ctx =
            lifetimePolicy === "context" && params !== undefined ? { ...base, params } : base;
          return factory(ctx as WithContext<Deps, Params>);
        },
      };
    },
  };
}

/** Start the provider builder for an Intent (`origin.kind: "boundary"`). */
export function createProvideApi<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
>(
  intent: Intent<BoundaryId, Name, Input, Success, Err>
): ProvideApi<BoundaryId, Name, Input, Success, Err> {
  return createProviderBuilder(intent, {} as EmptyDeps, "auto" as const, {
    kind: "boundary",
    id: intent.boundaryId,
  }) as ProvideApi<BoundaryId, Name, Input, Success, Err>;
}

/**
 * Start the provider builder for an Adapter realization (`origin.kind: "adapter"`).
 * `using` accepts Intents from any boundary.
 */
export function createAdaptProvideApi<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
>(
  intent: Intent<BoundaryId, Name, Input, Success, Err>,
  adapterId: string
): AdaptProvideApi<BoundaryId, Name, Input, Success, Err> {
  return createProviderBuilder(intent, {} as EmptyDeps, "auto" as const, {
    kind: "adapter",
    id: adapterId,
  }) as AdaptProvideApi<BoundaryId, Name, Input, Success, Err>;
}
