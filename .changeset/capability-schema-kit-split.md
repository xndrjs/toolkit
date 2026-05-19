---
"@xndrjs/domain-valibot": minor
"@xndrjs/domain-zod": minor
"@xndrjs/domain": minor
---

### Breaking: capability `.attach()` no longer extends the schema kit

`CapabilityBundle.attach` and `PrimitiveCapabilityBundle.attach` now return a **capability kit** with **only** the custom methods from `.methods()`. Schema helpers (`create`, `safeCreate`, `is`, `validator`, `type`, and shape `project`) remain on the **schema kit** (`UserShape`, `MoneyPrimitive`).

Capability factories receive a **context object** to destructure instead of a bare `patch` / `create` callback:

```ts
// shape — before
.methods((patch) => ({ rename(user, name) { return patch(user, { name }); } }))

// shape — after
.methods(({ patch, create, safeCreate, is }) => ({
  rename(user, name) { return patch(user, { name }); },
}))

// primitive — before
.methods((create) => ({ add(money, n) { return create(money + n); } }))

// primitive — after
.methods(({ create, safeCreate, is }) => ({
  add(money, n) { return create(money + n); },
}))
```

Migration at call sites:

| Before                   | After                         |
| ------------------------ | ----------------------------- |
| `User.create(input)`     | `UserShape.create(input)`     |
| `User.is(v)`             | `UserShape.is(v)`             |
| `User.safeCreate(input)` | `UserShape.safeCreate(input)` |
| `User.rename(u, name)`   | unchanged (capability kit)    |
| `Money.create(n)`        | `MoneyPrimitive.create(n)`    |
| `Money.add(m, n)`        | unchanged (capability kit)    |

New exported types: `ShapeCapabilityFactoryContext`, `PrimitiveCapabilityFactoryContext`, `ShapeCapabilityKit`, `PrimitiveCapabilityKit`. Reserved-name validation for capability method keys is removed (only “each entry must be a function” remains).

### Adapters

`@xndrjs/domain-zod` and `@xndrjs/domain-valibot` re-export the updated surface; update tests and apps that called `create` / `is` on capability kits to use the schema kit instead.
