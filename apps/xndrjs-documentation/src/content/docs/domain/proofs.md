---
title: Proofs
description: Add semantic guarantees on top of structurally valid data.
---

`domain.proof` models semantic guarantees on top of structural validation.

```text
trust is not assumed, it is established
```

A shape can tell you that an object is a valid `User`. A proof can tell you that this user is a `VerifiedUser`, `ActiveUser`, or `BillingReadyUser`.

## When to use a proof

Use a proof when the base representation is valid but not strong enough for a workflow.

Examples:

- password reset requires `VerifiedUser`
- payment capture requires `AuthorizedPayment`
- shipment requires `PaidOrder`
- admin-only action requires `AdminUser`

The proof makes the stronger condition explicit in code.

## Factory and refinement

```ts
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
  .refineType((user): user is typeof user & { isVerified: true } => {
    return user.isVerified === true;
  });
```

The validator establishes structure. `refineType` adds a type guard for meaning that the schema alone does not encode.

## assert vs test

Use `assert` when failure should stop the workflow:

```ts
const verified = VerifiedUser.assert(user);
```

Use `test` when you need a boolean branch:

```ts
if (VerifiedUser.test(user)) {
  sendPasswordReset(user);
}
```

Both validation and the optional guard must pass.

## Objects and prototypes

For plain objects, `proof` preserves the input prototype and merges parsed fields before freezing. That lets proofs add meaning without stripping an existing shape identity.

In practice:

- use `shape.create(raw)` to enter a canonical representation from raw input
- use `proof.assert(value)` to add a stronger guarantee to an in-memory value

## Failure behavior

Structural failures use the underlying validator's normalized `ValidationFailure`.

Guard failures surface as domain validation errors with a dedicated proof-guard issue code, so you can distinguish "wrong structure" from "right structure, missing guarantee".
