import type { Intent } from "./boundary.js";
import type { Result } from "./result.js";

/** Operation that fulfills an Intent contract. */
export type IntentOperation<Input, Success, Err> = (
  input: Input
) => Result<Success, Err> | Promise<Result<Success, Err>>;

/**
 * Map of same-boundary Intents accepted by `using`.
 * Uses a self-referential mapped constraint (no string index) so named keys stay required.
 */
export type SameBoundaryDeps<BoundaryId extends string, Deps> = {
  readonly [K in keyof Deps]: Deps[K] extends Intent<
    BoundaryId,
    string,
    infer _I,
    infer _S,
    infer _E
  >
    ? Deps[K]
    : Intent<BoundaryId, string, never, never, never>;
};

/** Resolved operations keyed like the `using` map. */
export type ResolvedDeps<Deps> = {
  readonly [K in keyof Deps]: Deps[K] extends Intent<string, string, infer I, infer S, infer E>
    ? IntentOperation<I, S, E>
    : never;
};

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
> = {
  readonly intent: Intent<BoundaryId, Name, Input, Success, Err>;
  readonly deps: Deps;
  readonly perContext: boolean;
  readonly factory: (deps: ResolvedDeps<Deps>) => IntentOperation<Input, Success, Err>;
};

type FactoryFn<Input, Success, Err, Deps> = (
  deps: ResolvedDeps<Deps>
) => IntentOperation<Input, Success, Err>;

type EmptyDeps = Record<string, never>;

type IsEmptyDeps<Deps> = [Deps] extends [EmptyDeps]
  ? EmptyDeps extends Deps
    ? true
    : false
  : false;

/** No-deps: pass the operation directly, or a zero-arg thunk for lazy instance setup. */
type NoDepsWithArg<Input, Success, Err> =
  | IntentOperation<Input, Success, Err>
  | (() => IntentOperation<Input, Success, Err>);

type ProviderBuilderBase<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps,
  PerContext extends boolean,
> = {
  using<NewDeps extends SameBoundaryDeps<BoundaryId, NewDeps>>(
    deps: NewDeps & SameBoundaryDeps<BoundaryId, NewDeps>
  ): ProviderBuilder<BoundaryId, Name, Input, Success, Err, NewDeps, PerContext>;
  perContext(): ProviderBuilder<BoundaryId, Name, Input, Success, Err, Deps, true>;
};

type ProviderBuilderWithDeps<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps,
  PerContext extends boolean,
> = ProviderBuilderBase<BoundaryId, Name, Input, Success, Err, Deps, PerContext> & {
  with(
    factory: FactoryFn<Input, Success, Err, Deps>
  ): Provider<BoundaryId, Name, Input, Success, Err, Deps>;
};

type ProviderBuilderNoDeps<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  PerContext extends boolean,
> = ProviderBuilderBase<BoundaryId, Name, Input, Success, Err, EmptyDeps, PerContext> & {
  /** No `using`: pass the Intent operation directly. */
  with(
    operation: IntentOperation<Input, Success, Err>
  ): Provider<BoundaryId, Name, Input, Success, Err, EmptyDeps>;
  /**
   * No `using`, lazy instance setup: zero-arg thunk that returns the operation
   * (e.g. create a DataLoader once, then return `(id) => …`).
   */
  with(
    create: () => IntentOperation<Input, Success, Err>
  ): Provider<BoundaryId, Name, Input, Success, Err, EmptyDeps>;
};

type ProviderBuilder<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps = EmptyDeps,
  PerContext extends boolean = false,
> =
  IsEmptyDeps<Deps> extends true
    ? ProviderBuilderNoDeps<BoundaryId, Name, Input, Success, Err, PerContext>
    : ProviderBuilderWithDeps<BoundaryId, Name, Input, Success, Err, Deps, PerContext>;

export type ProvideApi<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
> = ProviderBuilder<BoundaryId, Name, Input, Success, Err>;

/**
 * Normalize a no-deps `with` argument to the internal factory shape.
 *
 * - `(input) => …` (arity ≥ 1): treated as the Intent operation.
 * - `() => …` (arity 0): void-input operation **or** lazy setup thunk returning the operation;
 *   distinguished on first call (extra args are ignored by a void op / thunk).
 */
function normalizeNoDepsFactory<Input, Success, Err>(
  arg: NoDepsWithArg<Input, Success, Err>
): FactoryFn<Input, Success, Err, EmptyDeps> {
  if (arg.length >= 1) {
    return (_deps) => arg as IntentOperation<Input, Success, Err>;
  }

  return (_deps) => {
    let resolved: IntentOperation<Input, Success, Err> | undefined;

    return ((input: Input) => {
      if (resolved) {
        return resolved(input);
      }

      const first = (arg as () => unknown)();
      if (typeof first === "function") {
        resolved = first as IntentOperation<Input, Success, Err>;
        return resolved(input);
      }

      // Void-input operation: `arg` itself is the op; `first` is this call's Result.
      resolved = arg as IntentOperation<Input, Success, Err>;
      return first as Result<Success, Err>;
    }) as IntentOperation<Input, Success, Err>;
  };
}

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
  perContext: PerContext
): ProviderBuilder<BoundaryId, Name, Input, Success, Err, Deps, PerContext> {
  const hasDeps = Object.keys(deps as object).length > 0;

  const builder = {
    using<NewDeps extends SameBoundaryDeps<BoundaryId, NewDeps>>(
      newDeps: NewDeps & SameBoundaryDeps<BoundaryId, NewDeps>
    ) {
      return createProviderBuilder(intent, newDeps, perContext);
    },
    perContext() {
      return createProviderBuilder(intent, deps, true);
    },
    with(arg: NoDepsWithArg<Input, Success, Err> | FactoryFn<Input, Success, Err, Deps>) {
      const factory = hasDeps
        ? (arg as FactoryFn<Input, Success, Err, Deps>)
        : normalizeNoDepsFactory(arg as NoDepsWithArg<Input, Success, Err>);

      return {
        intent,
        deps,
        perContext,
        factory,
      };
    },
  };

  return builder as ProviderBuilder<BoundaryId, Name, Input, Success, Err, Deps, PerContext>;
}

/** Start the provider builder for an Intent. */
export function createProvideApi<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
>(
  intent: Intent<BoundaryId, Name, Input, Success, Err>
): ProvideApi<BoundaryId, Name, Input, Success, Err> {
  return createProviderBuilder(intent, {} as EmptyDeps, false);
}
