/**
 * Type-level compose asserts, split by invariant for clearer diagnostics.
 */
export type { AssertNoInvalidPinnedLifetimeEdges, AssertProvidersComplete } from "./graph.js";
export type {
  AssertExplicitParamsCover,
  AssertParamsCompatible,
  InferredParams,
} from "./params.js";
export type { AssertNoProviderUnions, AssertSurfaceAliasesSafe } from "./shape.js";
