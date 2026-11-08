/**
 * Public API for `@xndrjs/forma`.
 */
export { adapter } from "./adapter.js";
export type { Adapter } from "./adapter.js";

export { boundary, intentIdentity } from "./boundary.js";
export type { Boundary, Intent, IntentIdentity, IntentModality } from "./boundary.js";

export { aliasIntent } from "./alias-intent.js";
export type { IntentAlias, IntentAliasPair, WiringEntry } from "./alias-intent.js";

export { compose, defineComposition, defineWiring } from "./compose.js";
export type {
  CompositionPlanDescription,
  ComposeOptions,
  CompositionRoot,
  EntryBoundaries,
  ExecutionContext,
  ExecutionContextArgs,
  ExecutionContextOptions,
  ExecutionSurface,
  OnUnexpectedFailure,
  ProviderLifetimeDescription,
  ProviderLifetimeExplanation,
  SurfaceRootDescription,
  StreamSurfaceIterable,
  UnexpectedFailureEvent,
  UnexpectedFailurePhase,
} from "./composition/composition-contract.js";

export type {
  AnyIntentDeps,
  AdapterProviderOrigin,
  BoundaryProviderOrigin,
  Disposable,
  IntentOperation,
  Lifetime,
  LifetimePolicy,
  OperationFor,
  ParamsObject,
  ParamsReq,
  Provider,
  ProviderOrigin,
  ResolvedDeps,
  SameBoundaryDeps,
  StreamInvocation,
  StreamOperation,
  WithContext,
} from "./provider/provider.js";

export type {
  AdaptProvideApi,
  AdaptProviderBuilder,
  ProvideApi,
  ProviderBuilder,
} from "./provider/provider-builder.types.js";

export {
  cancelled,
  createCancellation,
  createUnexpectedFailure,
  expectedError,
  isCancellation,
  isTerminalOutcome,
  isUnexpectedFailure,
  out,
  success,
  unexpectedFailure,
} from "./invocation-outcome.js";
export type {
  Cancellation,
  ContractOut,
  ExpectedError,
  FailureId,
  InvocationOutcome,
  UnexpectedFailure,
} from "./invocation-outcome.js";
