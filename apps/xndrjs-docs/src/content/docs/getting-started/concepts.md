---
title: Concepts
description: Core concepts for xndrjs domain and validator adapters
order: 5
seeAlso: |
  - Start with the [Mental model](./mental-model.md)
  - Build a complete [First model](./first-model.md)
  - Read the [Domain overview](/docs/domain/overview)
  - Explore [Validator contract](/docs/domain/validator-and-errors)
  - Compare [adapter APIs](/docs/adapters/zod/overview)
---

# Fundamental concepts

This page introduces the conceptual model used across `xndrjs` domain packages.

## One contract, many engines

`@xndrjs/domain` is centered on the `Validator<Input, Output>` interface:

```typescript
interface Validator<Input, Output = Input> {
  readonly engine: string;
  validate(input: unknown): ValidationResult<Output>;
}
```

- Domain kits (`primitive`, `shape`, `proof`) consume this contract.
- Adapter packages (`domain-zod`, `domain-ajv`, `domain-valibot`) create validators from external schema engines.
- Your domain surface stays stable even if the underlying engine changes.

The adapter is a boundary detail. Your model still speaks in domain concepts:
`Email`, `User`, `VerifiedUser`, `User.verify(user)`.

## Validation result shape

Each validator returns a discriminated union:

```typescript
type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ValidationFailure };
```

Failures are normalized into `engine`, `issues`, and optional `raw` payload, so logs and error handling stay consistent across adapters.

## Domain kits

- `domain.primitive(type, validator)` for scalar-like values.
- `domain.shape(type, validator)` for structured objects with safe creation and projection.
- `domain.proof(brand, validator)` for semantic assertions with optional `refineType`.

All of them enforce runtime validation and expose type-level nominal distinctions.

## Capabilities and composition

- `domain.capabilities<Req>().methods(...).attach(shapeKit)` adds domain operations to a shape kit.
- `compose.array`, `compose.object`, `compose.optional` let you build validators without a third-party engine.
- `pipe(value, ...fns)` provides typed left-to-right composition utilities.

## About branded typing

You may see branded type terms in API signatures (`Branded`, `Brand`).  
Treat them as TypeScript nominal typing primitives from `@xndrjs/domain` internals, not as a separate package area.

## Adapter role

- `domain-zod`: bridges Zod schemas to domain validators and supports kit reuse in Zod schemas.
- `domain-ajv`: bridges JSON Schema/OpenAPI components via AJV.
- `domain-valibot`: bridges Valibot schemas and kit interoperability.

These adapter docs explain API details and trade-offs.

## The shortest useful path

For most projects, start in this order:

1. Pick the adapter that matches your existing schema engine.
2. Define primitives for meaningful scalar values.
3. Define shapes for trusted object representations.
4. Add capabilities for allowed transitions.
5. Add proofs only when a workflow needs stronger guarantees than the base shape.
