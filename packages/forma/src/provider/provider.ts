import type { Intent, IntentModality } from "../boundary.js";
import type { Result } from "../result.js";

/** Operation that fulfills a unary Intent contract. */
export type IntentOperation<Input, Success, Err> = (
  input: Input
) => Result<Success, Err> | Promise<Result<Success, Err>>;

/**
 * Per stream-invocation bag passed as the second argument to a {@link StreamOperation}.
 * Distinct from Provider {@link Lifetime}.signal (instance-scoped).
 */
export type StreamInvocation = {
  readonly signal: AbortSignal;
};

/**
 * Operation that fulfills a stream Intent contract: returns a cold AsyncIterable of
 * `Result` events (`err` is terminal; enforced by the surface wrapper).
 */
export type StreamOperation<Input, Item, Err> = (
  input: Input,
  invocation: StreamInvocation
) => AsyncIterable<Result<Item, Err>>;

/** Operation shape selected by Contract modality. */
export type OperationFor<Mode extends IntentModality, Input, Success, Err> = Mode extends "stream"
  ? StreamOperation<Input, Success, Err>
  : IntentOperation<Input, Success, Err>;

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
    infer _E,
    IntentModality
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
    infer _E,
    IntentModality
  >
    ? Deps[K]
    : Intent<string, string, never, never, never>;
};

/** Resolved operations keyed like the `using` map (shape follows each Intent's modality). */
export type ResolvedDeps<Deps> = {
  readonly [K in Extract<keyof Deps, string>]: Deps[K] extends Intent<
    string,
    string,
    infer I,
    infer S,
    infer E,
    infer Mode
  >
    ? OperationFor<Mode, I, S, E>
    : never;
};

/** Empty dependency map used when `.using` was not called. */
export type EmptyDeps = Record<string, never>;

export type IsEmptyDeps<Deps> = [Deps] extends [EmptyDeps]
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
 * Operation shape follows the Intent's modality.
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
  Mode extends IntentModality = "unary",
> = {
  readonly intent: Intent<BoundaryId, Name, Input, Success, Err, Mode>;
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
  ) => Awaitable<OperationFor<Mode, Input, Success, Err>>;
};
