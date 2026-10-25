/**
 * Public API for `@xndrjs/forma`.
 */
export { boundary } from "./boundary.js";
export type { Boundary, Intent } from "./boundary.js";

export { compose } from "./compose.js";
export type { Binding, ComposeOptions, CompositionRoot, ExecutionContext } from "./compose.js";

export type {
  IntentOperation,
  ProvideApi,
  Provider,
  ResolvedDeps,
  SameBoundaryDeps,
} from "./provider.js";

export { err, ok } from "./result.js";
export type { Result } from "./result.js";
