export { domainCore } from "./domain-core";

export { DomainValidationError } from "./errors";
export { pipe, type Unary } from "./pipe";
export type {
  ShapeInstance,
  ShapeKit,
  ShapeKitCore,
  ShapeMarked,
  ShapePatchImpl,
  ShapeProps,
} from "./shape";

export type { PrimitiveKit } from "./primitive";
export type { ProofFactory, ProofKit, ProofValue } from "./proof";
export type {
  CapabilitiesBuilder,
  CapabilityBundle,
  CapabilityMethods,
  CapabilityPatchFn,
} from "./capabilities";

export type { Brand, BrandMap, Branded, BrandOf, Mutable, PatchDelta } from "./branded";
export type { ValidationFailure, ValidationIssue, ValidationResult, Validator } from "./validation";
