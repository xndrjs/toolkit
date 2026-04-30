---
title: Proof
description: Semantic proofs with domain.proof — validation, refinement, assert, and test
order: 4
seeAlso: |
  - [Primitive and shape](./primitive-shape-proof.md)
  - [Validator and errors](./validator-and-errors.md)
---

# Proof

`domain.proof` models **semantic guarantees** on top of structural validation.

The central idea is:

```
trust is not assumed, it is established
```

A value becomes trustworthy only after crossing an explicit boundary.

This leads to:

- validation as a declared step
- clearly identified trusted representations
- no accidental use of unvalidated data

Flow:

1. A `Validator` establishes **structure** (schema-level parsing).
2. Optional `refineType` adds a **type guard** — extra meaning that the schema alone does not encode.
3. `assert` / `test` materialize or check values against that combined contract.

Use proofs when the base representation is valid but not strong enough for a specific
workflow. For example, a `User` shape may be valid whether `isVerified` is `true` or
`false`; a password reset flow may require a `VerifiedUser` proof.

## Factory and refinement

`domain.proof(brand, validator)` returns a **factory** that also behaves as a proof kit. Call `refineType` to attach a guard:

```typescript
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const VerifiedUser = domain
  .proof(
    "VerifiedUser",
    zodToValidator(
      z.object({
        id: z.string(),
        email: z.email(),
        isVerified: z.boolean(),
      })
    )
  )
  .refineType((row): row is typeof row & { isVerified: true } => {
    return row.isVerified === true;
  });
```

After `refineType`, you get a final **proof kit**.

## `assert` vs `test`

- **`assert(input)`** — validates, runs the guard if present, then returns a **proof value** or throws `DomainValidationError`.
- **`test(value)`** — returns `true` only if validation and guard both succeed; no throw.

```typescript
VerifiedUser.assert(user); // proof value or throws
VerifiedUser.test(user); // true or false
```

`assert` is best at command boundaries where invalid state should stop the workflow.
`test` is best inside branching logic.

## Objects and prototypes

For plain objects, `proof` preserves the input prototype and merges parsed fields (then freezes). That keeps class instances or custom prototypes intact when asserting structured data.

For shape instances, this means a proof can add meaning without stripping the existing
shape identity.

## Errors

Guard failures surface as domain validation errors with a dedicated issue code (`PROOF_GUARD` at runtime). Structural failures use the underlying validator’s `ValidationFailure` shape.
