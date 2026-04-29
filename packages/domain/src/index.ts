export { primitive, type PrimitiveKit } from "./primitive";
export { proof, type ProofFactory, type ProofKit, type ProofValue } from "./proof";
export {
  getShapePatchImpl,
  shape,
  type ShapeInstance,
  type ShapeKit,
  type ShapeKitCore,
  type ShapeMarked,
  type ShapePatchImpl,
  type ShapeProps,
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

export { DomainValidationError } from "./errors";

export { __brand, __patchImpl, __shapeMarker } from "./private-constants";
