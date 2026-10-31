import type { Intent, IntentModality } from "../boundary.js";
import { defineRuntimeBrand, readRuntimeBrand } from "../protocol/runtime-brand.js";
import type { Result } from "../result.js";

declare const formaProviderTypeBrand: unique symbol;

const FORMA_PROVIDER_RUNTIME = Symbol.for("@xndrjs/forma/provider-runtime/v1");

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
 * Best-effort object constraint; the runtime enforces the plain outer bag and
 * shallow-readonly semantics (nested values are not inspected).
 */
export type ParamsObject = object;

/** `void` or a {@link ParamsObject} (rejects primitives as the bag). */
export type ParamsReq = void | ParamsObject;

type HasArrayConstituent<T> = true extends (T extends readonly unknown[] ? true : false)
  ? true
  : false;

type HasCallableConstituent<T> = true extends (
  T extends (...args: never[]) => unknown ? true : false
)
  ? true
  : false;

type KeysOfUnion<T> = T extends unknown ? keyof T : never;

/**
 * Best-effort static approximation of the runtime plain-object rule. TypeScript
 * cannot inspect an object's prototype, so runtime validation remains authoritative.
 */
export type IsParamsShapeValid<Params> = [Params] extends [void]
  ? true
  : [Params] extends [object]
    ? HasArrayConstituent<Params> extends true
      ? false
      : HasCallableConstituent<Params> extends true
        ? false
        : Exclude<KeysOfUnion<Params>, string> extends never
          ? true
          : false
    : false;

/** Parameterless for valid Params; becomes an impossible required arg for invalid shapes. */
export type ParamsValidationArgs<Params> =
  IsParamsShapeValid<Params> extends true
    ? []
    : [error: "Execution Params must be a string-keyed plain object"];

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

export type BoundaryProviderOrigin<BoundaryId extends string> = {
  readonly kind: "boundary";
  readonly id: BoundaryId;
};

export type AdapterProviderOrigin<AdapterId extends string> = {
  readonly kind: "adapter";
  readonly id: AdapterId;
};

/**
 * `true` when two Intent declarations describe the same Contract. Intent
 * identity is intentionally not considered here; callers compare it separately.
 */
export type EquivalentIntentContract<Left, Right> =
  Left extends Intent<string, string, infer LI, infer LS, infer LE, infer LM>
    ? Right extends Intent<string, string, infer RI, infer RS, infer RE, infer RM>
      ? [LM, RM] extends [RM, LM]
        ? [LI, RI] extends [RI, LI]
          ? [LS, RS] extends [RS, LS]
            ? [LE, RE] extends [RE, LE]
              ? true
              : false
            : false
          : false
        : false
      : false
    : false;

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
  Origin extends ProviderOrigin = ProviderOrigin,
> = {
  readonly intent: Intent<BoundaryId, Name, Input, Success, Err, Mode>;
  readonly deps: Deps;
  /** Declared policy; the Composition owns the derived effective lifetime. */
  readonly lifetimePolicy: Policy;
  /** Who created this Provider (`boundary` via `Intent.provide`, or `adapter` via `.adapt`). */
  readonly origin: Origin;
  /** Nominal type payload; realization and Params machinery are not public metadata. */
  readonly [formaProviderTypeBrand]: {
    readonly contract: readonly [BoundaryId, Name, Input, Success, Err];
    readonly deps: Deps;
    readonly policy: Policy;
    readonly params: Params;
    readonly mode: Mode;
    readonly origin: Origin;
  };
};

/** Internal type accessor for the Params requirement carried by the nominal Provider brand. */
export type ProviderParamsOf<P> =
  P extends Provider<
    infer _BoundaryId,
    infer _Name,
    infer _Input,
    infer _Success,
    infer _Err,
    infer _Deps,
    infer _Policy,
    infer Params,
    infer _Mode,
    infer _Origin
  >
    ? Params
    : void;

export type ProviderFactory<Input, Success, Err, Deps, Params, Mode extends IntentModality> = (
  deps: ResolvedDeps<Deps>,
  lifetime: Lifetime,
  params?: [Params] extends [void] ? undefined : Readonly<Params>
) => Awaitable<OperationFor<Mode, Input, Success, Err>>;

type ProviderRuntime = {
  readonly factory: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime dependency erasure
    deps: ResolvedDeps<any>,
    lifetime: Lifetime,
    params?: unknown
  ) => Awaitable<OperationFor<IntentModality, unknown, unknown, unknown>>;
};

type ErasedProvider = Provider<
  string,
  string,
  // Type parameters occupy both input and output positions; runtime erasure needs `any`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  LifetimePolicy,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  IntentModality,
  ProviderOrigin
>;

/** Internal constructor used by the fluent builders. Not exported by the package entrypoint. */
export function createProviderDescriptor<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps,
  Policy extends LifetimePolicy,
  Params,
  Mode extends IntentModality,
  Origin extends ProviderOrigin,
>(options: {
  readonly intent: Intent<BoundaryId, Name, Input, Success, Err, Mode>;
  readonly deps: Deps;
  readonly lifetimePolicy: Policy;
  readonly origin: Origin;
  readonly factory: ProviderFactory<Input, Success, Err, Deps, Params, Mode>;
}): Provider<BoundaryId, Name, Input, Success, Err, Deps, Policy, Params, Mode, Origin> {
  const runtime = Object.freeze({ factory: options.factory });
  const descriptor = {
    intent: options.intent,
    deps: Object.freeze(options.deps as object) as Deps,
    lifetimePolicy: options.lifetimePolicy,
    origin: Object.freeze({ ...options.origin }),
  };
  defineRuntimeBrand(descriptor, FORMA_PROVIDER_RUNTIME, runtime);
  return Object.freeze(descriptor) as unknown as Provider<
    BoundaryId,
    Name,
    Input,
    Success,
    Err,
    Deps,
    Policy,
    Params,
    Mode,
    Origin
  >;
}

/** Runtime authenticity check for JavaScript, casts, and widened inputs. */
export function isProvider(value: unknown): value is ErasedProvider {
  const runtime = readRuntimeBrand(value, FORMA_PROVIDER_RUNTIME);
  return (
    typeof runtime === "object" &&
    runtime !== null &&
    typeof (runtime as { readonly factory?: unknown }).factory === "function"
  );
}

/** Internal realization accessor; keeps the executable hook out of the public Provider interface. */
export function providerFactory(provider: ErasedProvider): ProviderRuntime["factory"] {
  if (!isProvider(provider)) {
    throw new Error("Invalid Provider: expected a value created by Forma's provider builder");
  }
  return (provider as unknown as Record<PropertyKey, ProviderRuntime>)[FORMA_PROVIDER_RUNTIME]!
    .factory;
}
