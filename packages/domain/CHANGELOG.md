# @xndrjs/domain

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

- ### Breaking: capability `.attach()` no longer extends the schema kit

  `attach()` returns a **capability kit** with **only** custom methods from `.methods()`. Use the **schema kit** for `create`, `safeCreate`, `is`, `validator`, `type`, and shape `project`.

  Factories take a context object to destructure (`patch`, `create`, `safeCreate`, `is` for shapes; `create`, `safeCreate`, `is` for primitives) instead of a bare callback.

  Migration:

  | Before                   | After                         |
  | ------------------------ | ----------------------------- |
  | `User.create(input)`     | `UserShape.create(input)`     |
  | `User.is(v)`             | `UserShape.is(v)`             |
  | `User.safeCreate(input)` | `UserShape.safeCreate(input)` |
  | `User.rename(u, name)`   | unchanged                     |
  | `Money.create(n)`        | `MoneyPrimitive.create(n)`    |
  | `Money.add(m, n)`        | unchanged                     |

  New types: `ShapeCapabilityFactoryContext`, `PrimitiveCapabilityFactoryContext`, `ShapeCapabilityKit`, `PrimitiveCapabilityKit`.

  `@xndrjs/domain-zod` and `@xndrjs/domain-valibot` re-export the updated surface; update capability call sites accordingly.

## 0.2.0

### Minor Changes

- cd4ef3a: xndrjs domain stack and tasks: modeling, schema bridges, resilient async

## 0.1.1-alpha.0

### Patch Changes

- fe38108: added new domain + adapters
