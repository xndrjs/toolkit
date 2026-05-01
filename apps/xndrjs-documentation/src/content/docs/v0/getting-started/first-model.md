---
title: First model
description: Build a small domain model with a primitive, shape, capability, and proof.
---

This guide builds a complete model in a few small steps.

The example uses Zod, but the domain code depends only on the `Validator` contract. The same modeling style works with Valibot, AJV, or a custom validator.

## Install

```bash
pnpm add @xndrjs/domain-zod zod
```

`@xndrjs/domain-zod` re-exports the core domain APIs, so one import is enough for most Zod-based modules.

## Define a primitive

Primitives are for scalar-like values that deserve a domain name.

```ts
import { domain, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = domain.primitive(
  "Email",
  zodToValidator(z.email().transform((value) => value.toLowerCase()))
);

const email = Email.create("ADA@EXAMPLE.COM");
// email is "ada@example.com" with the Email brand at type level
```

The runtime value is still a string. The type is no longer an interchangeable string.

```ts
const Username = domain.primitive("Username", zodToValidator(z.string().min(3)));

function sendWelcomeEmail(to: KitInstance<typeof Email>) {
  // ...
}

const username = Username.create("ada");
const email = Email.create("ada@example.com");

sendWelcomeEmail(email); // OK
sendWelcomeEmail(username); // Type error: Username is not Email
```

Even if both values are strings at runtime, their brands prevent accidental mixups at compile time. This safety is static-only, so it adds no runtime overhead.

You can think of primitives as lightweight value objects: they carry domain meaning, validation, and identity-by-value semantics, but avoid the class-heavy ceremony often associated with traditional Value Object implementations.

## Define a shape

Shapes are trusted immutable object representations.

```ts
const UserShape = domain.shape(
  "User",
  zodToValidator(
    z.object({
      id: z.string().min(1),
      email: zodFromKit(Email),
      displayName: z.string().min(1),
      isVerified: z.boolean().default(false),
    })
  )
);

const user = UserShape.create({
  id: "user_1",
  email: "ADA@EXAMPLE.COM",
  displayName: "Ada",
});
```

After `create`, `user` is validated and frozen. If input is invalid, `create` throws `DomainValidationError`; use `safeCreate` when you want a result union.

## Add behavior with capabilities

Capabilities keep behavior on the kit while instances stay data-only.

```ts
const User = domain
  .capabilities<{ displayName: string; isVerified: boolean }>()
  .methods((patch) => ({
    rename(user, displayName: string) {
      return patch(user, { displayName });
    },
    verify(user) {
      return patch(user, { isVerified: true });
    },
  }))
  .attach(UserShape);

const renamed = User.rename(user, "Ada Lovelace");
const verified = User.verify(renamed);
```

The same capabilities set can be attached to multiple shapes, as long as those shapes expose the fields required by the methods.

```ts
const OrderShape = domain.shape(
  "Order",
  zodToValidator(
    z.object({
      id: z.string(),
      status: z.enum(["draft", "confirmed"]),
    })
  )
);

const OrderDetailShape = domain.shape(
  "OrderDetail",
  zodToValidator(
    z.object({
      id: z.string(),
      status: z.enum(["draft", "confirmed"]),
      lines: z.array(z.object({ sku: z.string(), qty: z.number().int().positive() })),
      shippingAddress: z.string().min(1),
    })
  )
);

const OrderCapabilities = domain
  .capabilities<{ status: "draft" | "confirmed" }>()
  .methods((patch) => ({
    confirm(order) {
      return patch(order, { status: "confirmed" });
    },
  }));

const Order = OrderCapabilities.attach(OrderShape);
const OrderDetail = OrderCapabilities.attach(OrderDetailShape);
```

Every capability transition goes through the shape validator again. You get a new frozen value, not a mutated object.

In the example above, `OrderDetail.confirm(...)` re-validates with the `OrderDetail` validator, while `Order.confirm(...)` re-validates with the `Order` validator. That works because `patch` is injected by the attached kit (`attach(...)`): the same method logic is reused, but validation is resolved from the specific shape binding.

## Add a proof when meaning gets stronger

A `User` can exist without being verified, but some workflows need a `VerifiedUser`.

```ts
const VerifiedUser = domain
  .proof(
    "VerifiedUser",
    zodToValidator(
      z.object({
        id: z.string(),
        email: zodFromKit(Email),
        displayName: z.string(),
        isVerified: z.boolean(),
      })
    )
  )
  .refineType((candidate): candidate is typeof candidate & { isVerified: true } => {
    return candidate.isVerified === true;
  });

const proven = VerifiedUser.assert(verified);
```

Use `assert` when failure should stop the workflow. Use `test` when you need a boolean branch.

```ts
if (VerifiedUser.test(verified)) {
  // verified is now known to satisfy the VerifiedUser proof in this branch
}
```

## Re-enter after transport

JSON preserves data, not shape identity.

```ts
const payload = JSON.stringify(verified);
const fromNetwork = JSON.parse(payload); // unknown

const trustedAgain = User.create(fromNetwork);
```

That is intentional. External data always re-enters through a boundary.

## What you gained

With a small amount of code, you now have:

- normalized input through Zod
- a named `Email` primitive
- an immutable `User` representation
- validated transitions through `User.rename` and `User.verify`
- an explicit `VerifiedUser` guarantee for stricter workflows

The model stays plain enough for everyday TypeScript, but the important boundaries are no longer implicit.
