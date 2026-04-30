---
title: Validator and errors
description: Validation contract, result shape, and DomainValidationError
order: 2
seeAlso: |
  - [Domain overview](./overview.md)
  - [Primitive and shape](./primitive-shape-proof.md)
  - [Proof](./proof.md)
---

# Validator and errors

Every domain kit relies on the same contract:

```typescript
interface Validator<Input, Output = Input> {
  readonly engine: string;
  validate(input: unknown): ValidationResult<Output>;
}
```

`Input` describes what `create`/`safeCreate` accept.  
`validate` always receives `unknown`, so runtime narrowing stays explicit.

## ValidationResult

```typescript
type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ValidationFailure };
```

Failure shape:

```typescript
type ValidationFailure = {
  engine: string;
  issues: readonly ValidationIssue[];
  raw?: unknown;
};
```

Each issue exposes `code`, `path`, `message`, and optional `meta`.

## Throwing vs safe APIs

- `create` / `assert` throw `DomainValidationError` on failure
- `safeCreate` returns a `ValidationResult` union

`DomainValidationError` exposes:

- `code: "DOMAIN_VALIDATION_ERROR"`
- `failure` (full `ValidationFailure`)
- `issues` getter for quick access
