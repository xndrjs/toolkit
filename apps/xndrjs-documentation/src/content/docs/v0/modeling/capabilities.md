---
title: Capabilities
description: Attach validated behavior to shape and primitive kits while keeping instances data-only.
---

Capabilities attach **custom methods** to a schema kit while keeping instances as plain immutable data (scalars or frozen shape rows).

```text
data is not responsible for its own evolution
```

## Schema kit vs capability kit

A **capability kit** exposes only the methods from `.methods()`. Construction, guards, and projection stay on the **schema kit** (`UserShape`, `MoneyPrimitive`).

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

## Four entry points

| Kit         | Path                                                                 | When                                     | Factory context                       | Transition                       |
| ----------- | -------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------- | -------------------------------- |
| `shape`     | `domain.capabilities.forShapeKit(shapeKit)`                          | **Preferred** when the kit is in scope   | `patch`, `create`, `safeCreate`, `is` | partial update + re-validation   |
| `shape`     | `domain.capabilities.forShapeContract<Contract>()` + `.attach(kit)`  | Minimal/shared contracts, delayed attach | same                                  | same                             |
| `primitive` | `domain.capabilities.forPrimitiveKit(primitiveKit)`                  | **Preferred** when the kit is in scope   | `create`, `safeCreate`, `is`          | new scalar value + re-validation |
| `primitive` | `domain.capabilities.forPrimitiveContract<Contract>()` + `.attach()` | Minimal/shared contracts, delayed attach | same                                  | same                             |

**Kit path:** pass the schema kit up front; `.methods(factory)` returns the capability kit directly — no separate `.attach`.

**Contract path:** declare the structural type methods operate on; `.methods(factory)` returns a bundle; call `.attach(schemaKit)` when you bind it.

Helpers in the factory context are wired from the schema kit. They are for **internal transitions** inside capability methods (for example `create(money + amount)`), not a second public API on the capability kit.

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

## Shape capabilities

Transitions use **`patch(entity, delta)`**, where `delta` is a partial row or a mutating callback on a draft. Every patch re-enters the shape validator.

### Kit path (recommended)

```ts
import { domain } from "@xndrjs/domain";

const User = domain.capabilities.forShapeKit(UserShape).methods(({ patch }) => ({
  rename(user, displayName: string) {
    return patch(user, { displayName });
  },
  verify(user) {
    return patch(user, { isVerified: true });
  },
}));

const updated = User.rename(existingUser, "New Name");
```

Props (and factory typing) are inferred from `UserShape`. There is no `.attach` step.

### Contract path (slice / delayed attach)

```ts
const renameCapability = domain.capabilities
  .forShapeContract<{ name: string }>()
  .methods(({ patch }) => ({
    rename(entity, nextName: string) {
      return patch(entity, { name: nextName });
    },
  }));

const User = renameCapability.attach(UserShape);
```

Keep the contract **minimal** — only the fields the methods read or patch. Prefer an explicit slice (`{ title: string }`) or `Pick<…>` on the **props** shape when you need a partial contract.

### Contract outer unwrap

Passing a shape **instance** type is accepted and treated as props:

```ts
type DemoItem = ReturnType<(typeof DemoItemShape)["create"]>; // ShapeInstance

const DemoItemCapabilities = domain.capabilities
  .forShapeContract<DemoItem>()
  .methods(({ patch }) => ({
    rename(item, title: string) {
      return patch(item, { title });
    },
  }))
  .attach(DemoItemShape);
```

`forShapeContract` unwraps only the **outer** instance wrappers (`ShapeInstance` / `ShapeProps`: shape brand + marker + outer `Readonly`). Nested field brands inside props (for example `id: Branded<"DemoId", string>`) stay part of the real contract.

When you own the kit, prefer `forShapeKit(DemoItemShape)` instead of typing the instance.

`patch` is only available inside the capability factory context. That keeps updates close to named domain operations and prevents exporting a generic "do anything" updater on the capability kit.

## Validated transitions

Every `patch` re-enters the shape validator before returning. If a transition would violate the shape validator, it fails the same way `UserShape.create` would fail.

This is a major guarantee: every transition preserves data validity by default, without relying on developers to remember manual validation at each call site.

### Reusable shape bundles

A contract-path bundle can attach to any compatible schema-only shape kit. Keep bundles small and named after domain actions, not generic setters.

### Shape constraints

- Kit path and attach both require schema-only shape kits (`Record<never, never>` methods).
- Instances remain frozen data records.

## Primitive capabilities

The value is a scalar (`string`, `number`, `boolean`, `bigint`, `symbol`). There is no row to patch — transitions produce a **new** validated scalar via **`create(next)`** from the factory context.

### Kit path (recommended)

```ts
import { domain } from "@xndrjs/domain-zod";
import { z } from "zod";

const MoneyPrimitive = domain.primitive("Money", z.number().int().nonnegative());

const Money = domain.capabilities.forPrimitiveKit(MoneyPrimitive).methods(({ create }) => ({
  add(money, amount: number) {
    return create(money + amount);
  },
  subtract(money, amount: number) {
    return create(money - amount);
  },
}));

const price = MoneyPrimitive.create(1_050);
const withTax = Money.add(price, 210);
```

### Contract path

```ts
const NormalizeString = domain.capabilities
  .forPrimitiveContract<string>()
  .methods(({ create }) => ({
    normalize(value: string) {
      return create(value.trim().toLowerCase());
    },
  }))
  .attach(DemoIdPrimitive);
```

### Contract outer unwrap (branded values)

```ts
type DemoId = ReturnType<(typeof DemoIdPrimitive)["create"]>; // Branded<"DemoId", string>

const NormalizeDemoId = domain.capabilities
  .forPrimitiveContract<DemoId>()
  .methods(({ create }) => ({
    normalize(value: string) {
      return create(value.trim().toLowerCase());
    },
  }))
  .attach(DemoIdPrimitive);
```

`forPrimitiveContract` unwraps only the outer primitive brand to the underlying scalar. Prefer `forPrimitiveKit` when the kit is in scope.

`create` in the factory uses the same validation rules as the primitive kit, without exposing construction on the capability kit.

### Primitive constraints

- Kit path and attach both require schema-only primitive kits.
- `create` in the factory always re-validates the next scalar.

## Choosing an entry point

| Question                                              | Answer                                             |
| ----------------------------------------------------- | -------------------------------------------------- |
| Own the shape kit and want max ergonomics?            | `forShapeKit(kit).methods(…)`                      |
| Need a minimal slice or attach later to several kits? | `forShapeContract<Slice>().methods(…).attach(kit)` |
| Own the primitive kit?                                | `forPrimitiveKit(kit).methods(…)`                  |
| Shared scalar contract / delayed attach?              | `forPrimitiveContract<C>().methods(…).attach(kit)` |
| Need partial updates on a record?                     | Shape paths only (`patch`)                         |
| Need arithmetic or replacement on a scalar?           | Primitive paths only (`create` in factory)         |
