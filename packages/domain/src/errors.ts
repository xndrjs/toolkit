import type { ValidationFailure, ValidationIssue } from "./validation";

export class DomainValidationError extends Error {
  readonly code = "DOMAIN_VALIDATION_ERROR";
  readonly failure: ValidationFailure;

  constructor(message: string, failure: ValidationFailure, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DomainValidationError";
    this.failure = failure;
  }

  get issues(): readonly ValidationIssue[] {
    return this.failure.issues;
  }
}
