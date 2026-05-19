---
title: Capabilities
description: Attach validated behavior to shape and primitive kits while keeping instances data-only.
---

Capabilities attach **custom methods** to a schema kit while keeping instances as plain immutable data (scalars or frozen shape rows).

```text
data is not responsible for its own evolution
```

## Schema kit vs capability kit

After `.attach(shapeKit)` or `.attach(primitiveKit)`, you get a **capability kit** with only the methods from `.methods()`. Construction, guards, and projection stay on the **schema kit** (`UserShape`, `MoneyPrimitive`).

| Operation                           | Schema kit | Capability kit      |
| ----------------------------------- | ---------- | ------------------- |
| `create` / `safeCreate`             | yes        | no — use schema kit |
| `is`                                | yes        | no                  |
| `validator`, `type`                 | yes        | no                  |
| `project` (shapes)                  | yes        | no                  |
| Custom methods (`rename`, `add`, …) | no         | yes                 |

```ts
UserShape.create({ displayName: "Ada", isVerified: false });
User.rename(user, "Ada Lovelace");
```

## Two entry points

| Kit         | API                                            | Factory context (destructure)         | Transition                       |
| ----------- | ---------------------------------------------- | ------------------------------------- | -------------------------------- |
| `shape`     | `domain.capabilities.forShape<Contract>()`     | `patch`, `create`, `safeCreate`, `is` | partial update + re-validation   |
| `primitive` | `domain.capabilities.forPrimitive<Contract>()` | `create`, `safeCreate`, `is`          | new scalar value + re-validation |

The contract generic (`Contract`) is the **minimal** structural type your methods need — usually a slice of the shape row or the underlying scalar type (`string`, `number`, …).

Helpers in the factory context are wired from the attached schema kit at `attach` time. They are for **internal transitions** inside capability methods (for example `create(money + amount)`), not a second public API on the capability kit.

## Why behavior lives on kits

Domain values often need operations: rename, verify, cancel, add credit, merge totals.

`xndrjs` models those operations as capability kit methods:

```ts
const updated = User.rename(existingUser, "New Name");
```

not as instance methods:

```ts
existingUser.rename("New Name");
```

This keeps the value easy to serialize, test, pass through UI state, and move between layers. The behavior still lives in the domain layer because it is on the `User` capability kit.

## Shape capabilities (`forShape`)

Use `forShape` when the kit is a **shape**: transitions are expressed with **`patch(entity, delta)`**, where `delta` is a partial row or a mutating callback on a draft. Every patch re-enters the shape validator.

```ts
import { domain } from "@xndrjs/domain";

const renameCapability = domain.capabilities.forShape<{ name: string }>().methods(({ patch }) => ({
  rename(entity, nextName: string) {
    return patch(entity, { name: nextName });
  },
}));

const User = renameCapability.attach(UserShape);
const updated = User.rename(existingUser, "New Name");
```

`patch` is only available inside the capability factory context. That keeps updates close to named domain operations.

It also prevents `patch` from being accidentally exported as a generic "do anything" method on the capability kit. In practice, shape transitions must be declared and named inside capabilities, not invented from random points in the application.
This gives you behavior encapsulation: every allowed operation on a shape is explicit in one place, so the domain keeps a clear overview of how that shape is allowed to evolve.

## Validated transitions

Every `patch` re-enters the shape validator before returning.

```ts
const User = domain.capabilities
  .forShape<{ displayName: string; isVerified: boolean }>()
  .methods(({ patch }) => ({
    rename(user, displayName: string) {
      return patch(user, { displayName });
    },
    verify(user) {
      return patch(user, { isVerified: true });
    },
  }))
  .attach(UserShape);
```

If a transition would violate the shape validator, it fails the same way `UserShape.create` would fail.

This is a major guarantee: every transition preserves data validity by default, without relying on developers to remember manual validation at each call site / at the end of each transition.

### Reusable shape bundles

A capability bundle can attach to any compatible schema-only shape kit. Keep bundles small and named after domain actions, not generic setters.

### Shape constraints

- Attach to schema-only shape kits (`Record<never, never>` methods) before adding other method bags.
- Instances remain frozen data records.

## Primitive capabilities (`forPrimitive`)

Use `forPrimitive` when the kit is a **primitive**: the value is a scalar (`string`, `number`, `boolean`, `bigint`, `symbol`). There is no row to patch — transitions produce a **new** validated scalar via **`create(next)`** from the factory context.

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const MoneyValidator = zodToValidator(z.number().int().nonnegative());
const MoneyPrimitive = domain.primitive("Money", moneyValidator);

const Money = domain.capabilities
  .forPrimitive<number>()
  .methods(({ create }) => ({
    add(money, amount: number) {
      return create(money + amount);
    },
    subtract(money, amount: number) {
      return create(money - amount);
    },
  }))
  .attach(MoneyPrimitive);

const price = MoneyPrimitive.create(1_050);
const withTax = Money.add(price, 210);
```

`create` in the factory uses the same validation rules as `MoneyPrimitive.create`, without exposing construction on the capability kit.

Primitives only accept validators whose output is scalar; object-like outputs are rejected at compile time and guarded at runtime.

### Primitive constraints

- Attach to schema-only primitive kits.
- `create` in the factory always re-validates the next scalar.

## Choosing `forShape` vs `forPrimitive`

| Question                                    | Answer                                            |
| ------------------------------------------- | ------------------------------------------------- |
| Is the kit a `domain.shape`?                | `capabilities.forShape` + `patch`                 |
| Is the kit a `domain.primitive`?            | `capabilities.forPrimitive` + `create` in factory |
| Need partial updates on a record?           | `forShape` only                                   |
| Need arithmetic or replacement on a scalar? | `forPrimitive` only                               |
