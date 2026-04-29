export { primitive, type PrimitiveKit } from "./primitive";
export { proof, type ProofKit, type ProofValue } from "./proof";
export {
  shape,
  type ShapeInstance,
  type ShapeKit,
  type ShapeKitCore,
  type ShapePatchImpl,
} from "./shape";
export {
  capabilities,
  type CapabilitiesBuilder,
  type CapabilityBundle,
  type CapabilityMethods,
  type CapabilityPatchFn,
} from "./capabilities";

export { pipe, type Unary } from "./pipe";

export type { Brand, BrandMap, Branded, BrandOf, Mutable, PatchDelta } from "./branded";
export type { ValidationFailure, ValidationIssue, ValidationResult, Validator } from "./validation";

export { __brand } from "./private-constants";
