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
  Disposable,
  IntentOperation,
  Lifetime,
  ProvideApi,
  Provider,
  ResolvedDeps,
  SameBoundaryDeps,
  WithContext,
} from "./provider.js";

export { err, ok } from "./result.js";
export type { Result } from "./result.js";
