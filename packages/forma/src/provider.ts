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
 * Cleanups run on `ctx.dispose()` (`.perContext()`) or `root.dispose()` (default).
 * `onDispose` is only valid during that materialization attempt: after the factory
 * returns (success commits to the owner bucket; failure rolls back locally) or after
 * the owning scope seals, further registration throws.
 *
 * `signal` belongs to the owning scope (execution context or composition root) and
 * aborts when that scope enters `disposing`. `seed` is set only for `.perContext()`
 * materializations — composition-lifetime factories must not read it (captive dependency).
 */
export type Lifetime = {
  readonly signal: AbortSignal;
  /** Immutable execution seed; only present for `.perContext()` providers. */
  readonly seed?: unknown;
  onDispose(cleanup: Disposable): void;
};

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
 * No `using` → only `lifetime`. With `using` → `deps` + `lifetime`.
 */
export type WithContext<Deps> =
  IsEmptyDeps<Deps> extends true
    ? { readonly lifetime: Lifetime }
    : { readonly deps: ResolvedDeps<Deps>; readonly lifetime: Lifetime };

/**
 * Registrable association of an Intent with a realization, dependencies, and lifecycle.
 * Inspectable in isolation (composition comes later).
 */
export type Provider<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps = Record<string, never>,
  PerContext extends boolean = false,
> = {
  readonly intent: Intent<BoundaryId, Name, Input, Success, Err>;
  readonly deps: Deps;
  readonly perContext: PerContext;
  /** Who created this Provider (`boundary` via `Intent.provide`, or `adapter` via `.adapt`). */
  readonly origin: ProviderOrigin;
  /** Internal materialization hook; prefer building via Intent.provide.with. */
  readonly factory: (
    deps: ResolvedDeps<Deps>,
    lifetime: Lifetime
  ) => Awaitable<IntentOperation<Input, Success, Err>>;
};

type WithFactory<Input, Success, Err, Deps> = (
  ctx: WithContext<Deps>
) => Awaitable<IntentOperation<Input, Success, Err>>;

/** Fluent steps after deps are fixed (`using` is one-shot). */
type ProviderBuilderAfterUsing<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps,
  PerContext extends boolean,
> = {
  perContext(): ProviderBuilderAfterUsing<BoundaryId, Name, Input, Success, Err, Deps, true>;
  with(
    factory: WithFactory<Input, Success, Err, Deps>
  ): Provider<BoundaryId, Name, Input, Success, Err, Deps, PerContext>;
};

/** Fluent steps after deps are fixed on the Adapter path (`using` is one-shot). */
type AdaptProviderBuilderAfterUsing<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps,
  PerContext extends boolean,
> = {
  perContext(): AdaptProviderBuilderAfterUsing<BoundaryId, Name, Input, Success, Err, Deps, true>;
  with(
    factory: WithFactory<Input, Success, Err, Deps>
  ): Provider<BoundaryId, Name, Input, Success, Err, Deps, PerContext>;
};

/** Builder for `Intent.provide`: `using` accepts only same-boundary Intents; one-shot. */
export type ProviderBuilder<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps = EmptyDeps,
  PerContext extends boolean = false,
> =
  IsEmptyDeps<Deps> extends true
    ? {
        using<NewDeps extends SameBoundaryDeps<BoundaryId, NewDeps>>(
          deps: StringKeyedDeps<NewDeps> & SameBoundaryDeps<BoundaryId, NewDeps>
        ): ProviderBuilderAfterUsing<BoundaryId, Name, Input, Success, Err, NewDeps, PerContext>;
        perContext(): ProviderBuilder<BoundaryId, Name, Input, Success, Err, EmptyDeps, true>;
        with(
          factory: WithFactory<Input, Success, Err, EmptyDeps>
        ): Provider<BoundaryId, Name, Input, Success, Err, EmptyDeps, PerContext>;
      }
    : ProviderBuilderAfterUsing<BoundaryId, Name, Input, Success, Err, Deps, PerContext>;

/** Builder for `adapter().adapt`: `using` accepts Intents from any boundary; one-shot. */
export type AdaptProviderBuilder<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps = EmptyDeps,
  PerContext extends boolean = false,
> =
  IsEmptyDeps<Deps> extends true
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
          PerContext
        >;
        perContext(): AdaptProviderBuilder<BoundaryId, Name, Input, Success, Err, EmptyDeps, true>;
        with(
          factory: WithFactory<Input, Success, Err, EmptyDeps>
        ): Provider<BoundaryId, Name, Input, Success, Err, EmptyDeps, PerContext>;
      }
    : AdaptProviderBuilderAfterUsing<BoundaryId, Name, Input, Success, Err, Deps, PerContext>;

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
  PerContext extends boolean,
>(
  intent: Intent<BoundaryId, Name, Input, Success, Err>,
  deps: Deps,
  perContext: PerContext,
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
      return createProviderBuilder(intent, sealedStringRecord(newDeps), perContext, origin);
    },
    perContext() {
      return createProviderBuilder(intent, deps, true as const, origin);
    },
    with(factory: WithFactory<Input, Success, Err, Deps>) {
      return {
        intent,
        deps,
        perContext,
        origin,
        factory: (resolved: ResolvedDeps<Deps>, lifetime: Lifetime) => {
          const ctx = (hasDeps ? { deps: resolved, lifetime } : { lifetime }) as WithContext<Deps>;
          return factory(ctx);
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
  return createProviderBuilder(intent, {} as EmptyDeps, false, {
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
  return createProviderBuilder(intent, {} as EmptyDeps, false, {
    kind: "adapter",
    id: adapterId,
  }) as AdaptProvideApi<BoundaryId, Name, Input, Success, Err>;
}
