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

type ProviderBuilder<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps = EmptyDeps,
  PerContext extends boolean = false,
> = {
  using<NewDeps extends SameBoundaryDeps<BoundaryId, NewDeps>>(
    deps: NewDeps & SameBoundaryDeps<BoundaryId, NewDeps>
  ): ProviderBuilder<BoundaryId, Name, Input, Success, Err, NewDeps, PerContext>;
  perContext(): ProviderBuilder<BoundaryId, Name, Input, Success, Err, Deps, true>;
  with(
    factory: FactoryFn<Input, Success, Err, Deps>
  ): Provider<BoundaryId, Name, Input, Success, Err, Deps>;
};

export type ProvideApi<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
> = ProviderBuilder<BoundaryId, Name, Input, Success, Err>;

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
  return {
    using<NewDeps extends SameBoundaryDeps<BoundaryId, NewDeps>>(
      newDeps: NewDeps & SameBoundaryDeps<BoundaryId, NewDeps>
    ) {
      return createProviderBuilder(intent, newDeps, perContext);
    },
    perContext() {
      return createProviderBuilder(intent, deps, true);
    },
    with(factory: FactoryFn<Input, Success, Err, Deps>) {
      return {
        intent,
        deps,
        perContext,
        factory,
      };
    },
  };
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
