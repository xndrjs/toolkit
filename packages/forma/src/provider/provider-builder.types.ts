import type { IntentModality } from "../boundary.js";
import type {
  AnyIntentDeps,
  AdapterProviderOrigin,
  BoundaryProviderOrigin,
  EmptyDeps,
  IsEmptyDeps,
  LifetimePolicy,
  OperationFor,
  ParamsReq,
  Provider,
  ProviderOrigin,
  SameBoundaryDeps,
  WithContext,
} from "./provider.js";

/** Reject maps that include symbol (or number) keys — Forma only wires string dependency names. */
type StringKeyedDeps<Deps> = Exclude<keyof Deps, string> extends never ? Deps : never;

type Awaitable<T> = T | PromiseLike<T>;

/**
 * Argument to `.with`: named fields avoid positional ambiguity between deps and lifetime.
 * Shared by Boundary and Adapter builders (constraint differences live on `using` only).
 * Return type follows Intent modality.
 */
export type WithFactory<Input, Success, Err, Deps, Params, Mode extends IntentModality> = (
  ctx: WithContext<Deps, Params>
) => Awaitable<OperationFor<Mode, Input, Success, Err>>;

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
  Mode extends IntentModality,
  Origin extends ProviderOrigin,
> = {
  with(
    factory: WithFactory<Input, Success, Err, Deps, Params, Mode>
  ): Provider<BoundaryId, Name, Input, Success, Err, Deps, Policy, Params, Mode, Origin>;
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
        P,
        Mode,
        Origin
      >;
      perComposition(): ProviderBuilderAfterUsing<
        BoundaryId,
        Name,
        Input,
        Success,
        Err,
        Deps,
        "composition",
        void,
        Mode,
        Origin
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
  Mode extends IntentModality,
  Origin extends ProviderOrigin,
> = {
  with(
    factory: WithFactory<Input, Success, Err, Deps, Params, Mode>
  ): Provider<BoundaryId, Name, Input, Success, Err, Deps, Policy, Params, Mode, Origin>;
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
        P,
        Mode,
        Origin
      >;
      perComposition(): AdaptProviderBuilderAfterUsing<
        BoundaryId,
        Name,
        Input,
        Success,
        Err,
        Deps,
        "composition",
        void,
        Mode,
        Origin
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
  Mode extends IntentModality = "unary",
  Deps = EmptyDeps,
  Policy extends LifetimePolicy = "auto",
  Params = void,
  Origin extends ProviderOrigin = BoundaryProviderOrigin<BoundaryId>,
> = (IsEmptyDeps<Deps> extends true
  ? {
      using<NewDeps extends SameBoundaryDeps<BoundaryId, NewDeps>>(
        deps: StringKeyedDeps<NewDeps> & SameBoundaryDeps<BoundaryId, NewDeps>
      ): ProviderBuilderAfterUsing<
        BoundaryId,
        Name,
        Input,
        Success,
        Err,
        NewDeps,
        Policy,
        Params,
        Mode,
        Origin
      >;
      with(
        factory: WithFactory<Input, Success, Err, EmptyDeps, Params, Mode>
      ): Provider<BoundaryId, Name, Input, Success, Err, EmptyDeps, Policy, Params, Mode, Origin>;
    }
  : ProviderBuilderAfterUsing<
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
    >) &
  (Policy extends "auto"
    ? {
        perContext<P extends ParamsReq = void>(): ProviderBuilder<
          BoundaryId,
          Name,
          Input,
          Success,
          Err,
          Mode,
          Deps,
          "context",
          P,
          Origin
        >;
        perComposition(): ProviderBuilder<
          BoundaryId,
          Name,
          Input,
          Success,
          Err,
          Mode,
          Deps,
          "composition",
          void,
          Origin
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
  Mode extends IntentModality = "unary",
  Deps = EmptyDeps,
  Policy extends LifetimePolicy = "auto",
  Params = void,
  Origin extends ProviderOrigin = AdapterProviderOrigin<string>,
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
        Params,
        Mode,
        Origin
      >;
      with(
        factory: WithFactory<Input, Success, Err, EmptyDeps, Params, Mode>
      ): Provider<BoundaryId, Name, Input, Success, Err, EmptyDeps, Policy, Params, Mode, Origin>;
    }
  : AdaptProviderBuilderAfterUsing<
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
    >) &
  (Policy extends "auto"
    ? {
        perContext<P extends ParamsReq = void>(): AdaptProviderBuilder<
          BoundaryId,
          Name,
          Input,
          Success,
          Err,
          Mode,
          Deps,
          "context",
          P,
          Origin
        >;
        perComposition(): AdaptProviderBuilder<
          BoundaryId,
          Name,
          Input,
          Success,
          Err,
          Mode,
          Deps,
          "composition",
          void,
          Origin
        >;
      }
    : Record<never, never>);

export type ProvideApi<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Mode extends IntentModality = "unary",
> = ProviderBuilder<BoundaryId, Name, Input, Success, Err, Mode>;

export type AdaptProvideApi<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Mode extends IntentModality = "unary",
  AdapterId extends string = string,
> = AdaptProviderBuilder<
  BoundaryId,
  Name,
  Input,
  Success,
  Err,
  Mode,
  EmptyDeps,
  "auto",
  void,
  AdapterProviderOrigin<AdapterId>
>;
