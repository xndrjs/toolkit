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

const EmailKit = domain.primitive(
  "Email",
  zodToValidator(z.email().transform((value) => value.toLowerCase()))
);

const email = EmailKit.create("ADA@EXAMPLE.COM");
// email is "ada@example.com" with the Email brand at type level

type Email = KitInstance<typeof Email>;
```

The runtime value is still a string, but its type can no longer be mistaken for "any string".

```ts
// define a function using a branded value (Email)
function sendWelcomeEmail(to: Email) {
  // ...
}

// let's say we have another branded primitive
const UsernameKit = domain.primitive("Username", zodToValidator(z.string().min(3)));

// create new values
const username = UsernameKit.create("ada");
const email = EmailKit.create("ada@example.com");

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
      email: zodFromKit(EmailKit), // compose existing kit
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

Note how `email` is passed as a plain input value (`"ADA@EXAMPLE.COM"`), not as `EmailKit.create(...)`. Parent shapes that embed child kits are intended to accept **raw** nested payloads: the parent’s validator runs end-to-end and materializes branded or nested kit values for you. You do not need a nested ceremony of `create` calls at every level just to assemble one object.

## Add behavior with capabilities

Capabilities keep behavior on the kit while instances stay data-only.

```ts
const User = domain
  // the contract on which the capability operates is passed as generics
  .capabilities<{ displayName: string; isVerified: boolean }>()
  // patch is intentionally scoped here: it is not exported
  // so callers cannot update the shape arbitrarily,
  // they must use explicit semantic methods instead
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
const OrderSchema = z.object({
  id: z.string(),
  status: z.enum(["draft", "confirmed"]),
});

const OrderShape = domain.shape("Order", zodToValidator(OrderSchema));

const OrderDetailShape = domain.shape(
  "OrderDetail",
  zodToValidator(
    OrderSchema.extend({
      lines: z.array(
        z.object({
          sku: z.string(),
          qty: z.number().int().positive(),
        })
      ),
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

Every capability transition goes through the shape validator again. You get a new frozen value, not a mutated object with the same reference.

In the example above, `OrderDetail.confirm(...)` re-validates with the `OrderDetail` validator, while `Order.confirm(...)` re-validates with the `Order` validator. That works because `patch` is injected by the attached kit (`attach(...)`): the same method logic is reused, but validation is resolved from the specific shape binding.

### Keeping the capability contract small

The idea of explicitly defining the interface on which the `capabilities` operate lines up with the **Interface Segregation** idea: you _can_ type `capabilities` with the full props of a particular shape, and TypeScript will accept it when you attach that shape. The more maintainable approach is to keep the generic parameter **minimal**—only the fields the methods actually touch (reads, `patch` payloads, or other invariants the capability logic assumes). A narrower type states the real contract, makes reuse across richer shapes (like `OrderDetail` next to `Order`) obvious instead of accidental, and avoids coupling capability bundles to one row shape when they only need a slice of it.

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
