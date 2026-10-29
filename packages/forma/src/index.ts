/**
 * Public API for `@xndrjs/forma`.
 */
export { adapter } from "./adapter.js";
export type { Adapter } from "./adapter.js";

export { boundary, intentIdentity } from "./boundary.js";
export type { Boundary, Intent, IntentIdentity } from "./boundary.js";

export { aliasIntent } from "./alias-intent.js";
export type { IntentAlias, IntentAliasPair, WiringEntry } from "./alias-intent.js";

export { compose, defineComposition, defineWiring } from "./compose.js";
export type {
  ComposeOptions,
  CompositionRoot,
  ExecutionContext,
  ExecutionContextArgs,
  ExecutionContextOptions,
  ExecutionSurface,
} from "./compose.js";

export type {
  AdaptProvideApi,
  AdaptProviderBuilder,
  AnyIntentDeps,
  Disposable,
  IntentOperation,
  Lifetime,
  ParamsObject,
  ParamsReq,
  ProvideApi,
  Provider,
  ProviderBuilder,
  ProviderOrigin,
  ResolvedDeps,
  SameBoundaryDeps,
  WithContext,
} from "./provider.js";

export { err, ok } from "./result.js";
export type { Result } from "./result.js";
