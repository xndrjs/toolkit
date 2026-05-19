# @xndrjs/domain-zod

## 0.3.0-alpha.1

### Minor Changes

- ed03f7f: ### Breaking: capability `.attach()` no longer extends the schema kit

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

### Patch Changes

- Updated dependencies [ed03f7f]
  - @xndrjs/domain@0.3.0-alpha.1

## 0.3.0-alpha.0

### Minor Changes

- a3f9916: ### Breaking: capabilities API split by kit kind

  `domain.capabilities<Contract>()` is removed. Use the namespace instead:
  - **`domain.capabilities.forShape<Contract>()`** — attach to shape kits. Factory receives **`patch(instance, delta)`** (partial row or draft callback); transitions re-validate through the shape validator.
  - **`domain.capabilities.forPrimitive<Contract>()`** — attach to primitive kits. Factory receives **`create(next)`** (full scalar replacement), not `patch`. Use for operations such as `Money.add(money, cents)` where the next value is validated via the primitive boundary.

  Migration:

  ```ts
  // before
  domain.capabilities<{ name: string }>().methods((patch) => ({ … })).attach(UserShape);

  // after
  domain.capabilities.forShape<{ name: string }>().methods((patch) => ({ … })).attach(UserShape);
  ```

  ### Primitives are scalar-only

  `domain.primitive` now requires validator `Input` and `Value` to be scalars (`string`, `number`, `boolean`, `bigint`, `symbol`). Object-shaped validator outputs must use `domain.shape`. A runtime guard rejects non-scalar values returned from a primitive validator.

  ### Adapters

  `@xndrjs/domain-zod` and `@xndrjs/domain-valibot` re-export the updated `domain` surface; update call sites that used `domain.capabilities<…>()` to `domain.capabilities.forShape<…>()` (or `forPrimitive` where applicable).

### Patch Changes

- Updated dependencies [a3f9916]
  - @xndrjs/domain@0.3.0-alpha.0

## 0.2.0

### Minor Changes

- cd4ef3a: xndrjs domain stack and tasks: modeling, schema bridges, resilient async

### Patch Changes

- Updated dependencies [cd4ef3a]
  - @xndrjs/domain@0.2.0

## Unreleased

### Breaking Changes

- Removed `zodFromKit(schema, kit)`. Nested fields must delegate entirely to the kit; put parsing and transforms on the kit’s validator (for example via `zodToValidator`).

## 0.1.1-alpha.0

### Patch Changes

- fe38108: added new domain + adapters
- Updated dependencies [fe38108]
  - @xndrjs/domain@0.1.1-alpha.0
