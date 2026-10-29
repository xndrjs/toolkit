/**
 * Public API for `@xndrjs/forma`.
 */
export { boundary } from "./boundary.js";
export type { Boundary, Intent } from "./boundary.js";

export { bind, compose } from "./compose.js";
export type {
  Binding,
  BindingPair,
  ComposeOptions,
  CompositionRoot,
  ExecutionContext,
} from "./compose.js";

export type {
  AdaptProvideApi,
  AdaptProviderBuilder,
  AnyIntentDeps,
  Disposable,
  IntentOperation,
  Lifetime,
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
