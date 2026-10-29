/**
 * Public API for `@xndrjs/forma`.
 */
export { adapter } from "./adapter.js";
export type { Adapter } from "./adapter.js";

export { boundary, intentIdentity } from "./boundary.js";
export type { Boundary, Intent, IntentIdentity } from "./boundary.js";

export { bind } from "./bind.js";
export type { Binding, BindingPair, WiringEntry } from "./bind.js";

export { compose } from "./compose.js";
export type { ComposeOptions, CompositionRoot, ExecutionContext } from "./compose.js";

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
