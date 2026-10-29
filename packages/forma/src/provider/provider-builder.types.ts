import type {
  AnyIntentDeps,
  EmptyDeps,
  IntentOperation,
  IsEmptyDeps,
  LifetimePolicy,
  ParamsReq,
  Provider,
  SameBoundaryDeps,
  WithContext,
} from "./provider.js";

/** Reject maps that include symbol (or number) keys — Forma only wires string dependency names. */
type StringKeyedDeps<Deps> = Exclude<keyof Deps, string> extends never ? Deps : never;

type Awaitable<T> = T | PromiseLike<T>;

/**
 * Argument to `.with`: named fields avoid positional ambiguity between deps and lifetime.
 * Shared by Boundary and Adapter builders (constraint differences live on `using` only).
 */
export type WithFactory<Input, Success, Err, Deps, Params> = (
  ctx: WithContext<Deps, Params>
) => Awaitable<IntentOperation<Input, Success, Err>>;

/** Fluent steps after deps are fixed (`using` is one-shot). */
export type ProviderBuilderAfterUsing<
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
export type AdaptProviderBuilderAfterUsing<
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
