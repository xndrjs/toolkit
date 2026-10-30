/**
 * Type-level compose asserts, split by invariant for clearer diagnostics.
 */
export type {
  AssertNoInvalidPinnedLifetimeEdges,
  AssertProviderContractsCompatible,
  AssertProvidersComplete,
} from "./graph.js";
export type {
  AssertExplicitParamsCover,
  AssertExplicitParamsShape,
  AssertParamsCompatible,
  InferredParams,
} from "./params.js";
export type {
  AssertEntryBoundaries,
  AssertNoProviderUnions,
  AssertSurfaceAliasesSafe,
} from "./shape.js";
