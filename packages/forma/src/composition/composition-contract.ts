import type { AnyProvider, WiringEntry } from "../alias-intent.js";
import type { IntentIdentity, IntentModality } from "../boundary.js";
import type { EffectiveLifetime } from "../graph-plan.js";
import type { LifetimePolicy, Provider } from "../provider/provider.js";
import type { Result } from "../result.js";

/** Read-only explanation of one Provider's declared and graph-derived lifetime. */
export type ProviderLifetimeDescription = {
  readonly intent: IntentIdentity;
  /** Contract modality (`unary` | `stream`); property of the Intent, not the Provider. */
  readonly mode: IntentModality;
  readonly declared: LifetimePolicy;
  readonly effective: EffectiveLifetime;
  /** Structured path from an `auto` Provider to the context-bound cause. */
  readonly narrowedBy?: readonly IntentIdentity[];
};

export type CompositionPlanDescription = {
  readonly providers: readonly ProviderLifetimeDescription[];
};

type Awaitable<T> = T | PromiseLike<T>;

/** Public stream surface value: cold iterable + dispose; not a public iterator. */
export type StreamSurfaceIterable<Item, Err> = AsyncIterable<Result<Item, Err>> & AsyncDisposable;

type SurfaceOperation<P> =
  // Deps is invariant on Provider (factory param); erase with `any` so surface
  // aliases still expose Input/Success/Err when the provider has `using` deps.
  // Unary aliases return a Promise (lazy materialize + invoke).
  // Stream aliases return a sync AsyncIterable (lazy materialize on first next).
  P extends Provider<
    string,
    string,
    infer Input,
    infer Success,
    infer Err,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Deps erasure
    any,
    LifetimePolicy,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Params erasure
    any,
    infer Mode
  >
    ? Mode extends "stream"
      ? (input: Input) => StreamSurfaceIterable<Success, Err>
      : (input: Input) => Promise<Result<Success, Err>>
    : never;

/**
 * Borrowed public aliases from `compose({ surface })`.
 * Lifecycle controls (`dispose`, AsyncDisposable) stay on the execution handle.
 */
export type ExecutionSurface<Surface extends Record<string, AnyProvider>> = {
  readonly [K in Exclude<keyof Surface & string, "dispose" | "surface">]: SurfaceOperation<
    Surface[K]
  >;
};

/** Options bag for {@link CompositionRoot.openExecutionContext} / {@link CompositionRoot.withExecutionContext}. */
export type ExecutionContextOptions<Params = void> = [Params] extends [void]
  ? { readonly params?: undefined; readonly signal?: AbortSignal }
  : { readonly params: Params; readonly signal?: AbortSignal };

/**
 * Shared rest-args for open/with: no bag required when `Params` is `void`;
 * otherwise `{ params, signal? }` is required.
 */
export type ExecutionContextArgs<Params = void> = [Params] extends [void]
  ? [] | [options?: ExecutionContextOptions<Params>]
  : [options: ExecutionContextOptions<Params>];

/**
 * Owned execution lifetime: nested {@link ExecutionSurface} plus dispose controls.
 * Prefer {@link CompositionRoot.withExecutionContext} for short scopes.
 */
export type ExecutionContext<Surface extends Record<string, AnyProvider>, Params = void> = {
  readonly surface: ExecutionSurface<Surface>;
  /** Scope signal; aborted when this context enters `disposing` (and if a host signal aborts). */
  readonly signal: AbortSignal;
  readonly params: [Params] extends [void] ? undefined : Readonly<Params>;
  /**
   * Release resources whose effective lifetime belongs to this context.
   * Concurrent callers share one dispose promise; terminal after settle.
   */
  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

export type CompositionRoot<Surface extends Record<string, AnyProvider>, Params = void> = {
  /** Explain declared and effective Provider lifetimes for diagnostics and tests. */
  describePlan(): CompositionPlanDescription;
  /**
   * Open an owned execution context. Caller must `dispose` / `await using`.
   * Prefer {@link withExecutionContext} for short lexical scopes.
   */
  openExecutionContext(...options: ExecutionContextArgs<Params>): ExecutionContext<Surface, Params>;
  /**
   * @deprecated Use {@link CompositionRoot.openExecutionContext}.
   */
  createExecutionContext(
    ...options: ExecutionContextArgs<Params>
  ): ExecutionContext<Surface, Params>;
  /**
   * Safe default for short scopes: open → run with a borrowed surface → dispose.
   * See error matrix: both failures → `SuppressedError(cleanup, callback)`.
   */
  withExecutionContext<T>(
    run: (surface: ExecutionSurface<Surface>) => Awaitable<T>,
    ...options: ExecutionContextArgs<Params>
  ): Promise<Awaited<T>>;
  /**
   * Terminal composition shutdown (backstop): refuse new contexts, dispose every
   * open execution context, then run root-owned cleanups. Concurrent
   * callers share one dispose promise; state becomes `disposed` even when a
   * cleanup fails.
   */
  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

/**
 * Shape of `compose({ surface, wiring? })`.
 *
 * **Do not annotate concrete configs as `ComposeOptions`.** The default type
 * parameters widen Surface and Wiring to erased Providers, which disables
 * missing-provider / lifetime / Provider-union checks and autocomplete.
 * Prefer an inferred inline object literal. Use {@link defineWiring} /
 * {@link defineComposition} only when extracting wiring or the options bag.
 */
export type ComposeOptions<
  Surface extends Record<string, AnyProvider> = Record<string, AnyProvider>,
  Wiring extends readonly WiringEntry[] = readonly WiringEntry[],
> = {
  readonly surface: Surface;
  /**
   * Private providers and {@link aliasIntent} aliases for dependency resolution.
   * Providers here are not on the context; intent aliases rewrite required Intent identity
   * to a satisfier whose provider is registered (surface or wiring).
   * Prefer an inline `wiring: […]` tuple at `compose`. Use {@link defineWiring}
   * only when extracting this array so the tuple stays precise.
   * Prefer Adapter / Provider passthrough over {@link aliasIntent} for cross-boundary wiring.
   */
  readonly wiring?: Wiring;
};
