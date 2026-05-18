---
title: Primitives and shapes
description: Model scalar values and trusted object representations.
---

Primitives and shapes are the two main ways to materialize trusted values at a boundary.

Their common mantra is:

> if a piece of data was created, then it is valid

## Primitives

Use `domain.primitive` for **scalar** values with domain meaning: `string`, `number`, `boolean`, `bigint`, or `symbol`.

The validator’s output type must be scalar as well. Object-shaped outputs belong on `domain.shape`, not on a primitive.

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = domain.primitive("Email", zodToValidator(z.email()));
const email = Email.create("alice@example.com");
```

At runtime, the value remains a plain scalar. At type level, it carries a nominal brand. That helps TypeScript distinguish an `Email` from any other string.

To attach behavior (for example `Money.add`), use [`capabilities.forPrimitive`](/v0/domain/capabilities/) — factories receive `create`, not `patch`.

Good primitive candidates:

- `Email`
- `UserId`
- `OrderId`
- `CurrencyCode`
- `Slug`

## Shapes

Use `domain.shape` for object representations that should become trusted and immutable after validation.

```ts
const User = domain.shape(
  "User",
  zodToValidator(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
    })
  )
);

const user = User.create({ id: "u_1", name: "Alice" });
```

Shape instances are frozen. `User.is` treats the kit’s unique prototype as runtime identity: the value must come from that kit, then the payload is validated again.

```ts
User.is(user); // true
```

## Safe creation

Use `safeCreate` when invalid input is part of the normal flow:

```ts
const result = User.safeCreate(input);

if (result.success) {
  renderUser(result.data);
} else {
  renderValidationErrors(result.error.issues);
}
```

## After JSON transport

JSON preserves data, not shape identity.

```ts
const payload = JSON.stringify(user);
const fromJson = JSON.parse(payload) as unknown;

User.is(fromJson); // false

const trustedAgain = User.create(fromJson);
User.is(trustedAgain); // true
```

This is intentional. Anything that crosses an external boundary should re-enter through `create` or `safeCreate`.

## Projection

Shape kits expose `project(instance, targetKit)` for converting one trusted representation into another compatible representation through a target validator.

Use projection when you want an explicit, validated transition between representations rather than ad-hoc object spreading.
