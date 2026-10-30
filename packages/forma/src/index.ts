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
  ExecutionContext,
  ExecutionContextArgs,
  ExecutionContextOptions,
  ExecutionSurface,
  ProviderLifetimeDescription,
  StreamSurfaceIterable,
} from "./composition/composition-contract.js";

export type {
  AnyIntentDeps,
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

export { err, ok } from "./result.js";
export type { Result } from "./result.js";
