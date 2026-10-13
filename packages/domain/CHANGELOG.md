# @xndrjs/domain

## 0.4.0-alpha.1

### Minor Changes

- c036b02: ### Breaking: `domain.core` factories, adapter native schemas, Kit/Contract capabilities

  #### Modeling factories → `domain.core` (Validator-only)

  In `@xndrjs/domain`, `domain.shape` / `domain.primitive` / `domain.proof` move to **`domain.core.shape` / `core.primitive` / `core.proof`**. They accept a `Validator` only.

  #### Adapters: top-level native schemas

  `@xndrjs/domain-zod` and `@xndrjs/domain-valibot` export an adapted `domain` whose top-level `shape` / `primitive` / `proof` accept **engine schemas only**. Validators go through `domain.core.*` (via `zodToValidator` / `valibotToValidator`). This avoids dual overloads that produced misleading IntelliSense (`schema: never`).

  ```ts
  // core
  import { domain } from "@xndrjs/domain";
  domain.core.shape("User", userValidator);

  // Zod adapter
  import { domain } from "@xndrjs/domain-zod";
  domain.shape("User", z.object({ id: z.string() })); // Zod schema
  domain.core.shape("User", zodToValidator(schema)); // Validator path
  ```

  Same pattern for `@xndrjs/domain-valibot`. `zodToValidator` / `valibotToValidator` / `*FromKit` stay public. Ajv stays on `domain.core.*` + `*ToValidator`.

  | Before (core)                                        | After                                                                                 |
  | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
  | `domain.shape(…)` / `primitive` / `proof`            | `domain.core.shape` / `primitive` / `proof`                                           |
  | Adapter `domain.shape(name, zodToValidator(schema))` | `domain.shape(name, schema)` **or** `domain.core.shape(name, zodToValidator(schema))` |

  #### Capabilities: Kit vs Contract entry points

  `domain.capabilities.forShape` and `forPrimitive` are removed. Use:
  - **`forShapeKit(shapeKit)`** — infer props; `.methods(factory)` returns the capability kit (no `.attach`)
  - **`forShapeContract<Contract>()`** — explicit contract; `.methods(…).attach(shapeKit)`
  - **`forPrimitiveKit(primitiveKit)`** / **`forPrimitiveContract<Contract>()`** — same split for scalars

  Contract paths **outer-unwrap** convenience types (`ShapeInstance` / `ShapeProps` → props; `Branded` → scalar). Prefer the Kit path when the schema kit is in scope.

  ```ts
  // before
  domain.capabilities.forShape<{ name: string }>().methods(({ patch }) => ({ … })).attach(UserShape);

  // after (kit in scope)
  domain.capabilities.forShapeKit(UserShape).methods(({ patch }) => ({ … }));

  // after (shared / delayed attach)
  domain.capabilities.forShapeContract<{ name: string }>().methods(({ patch }) => ({ … })).attach(UserShape);
  ```

  New exported types: `CapabilityShapeContract`, `CapabilityPrimitiveContract`, `ShapeKitCapabilitiesBuilder`, `PrimitiveKitCapabilitiesBuilder`, `ShapeAttachMismatchError`, `PrimitiveAttachMismatchError`.

  #### Engines

  Require Node.js 24 or 25 (`>=24 <26`) for `@xndrjs/domain`, `@xndrjs/domain-zod`, `@xndrjs/domain-valibot`, and `@xndrjs/domain-ajv`.

## 0.3.1-alpha.0

### Patch Changes

- 50df7a4: Require Node.js 24 or 25 (`>=24 <26`).

## 0.3.0

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

  `domain.core.primitive` now requires validator `Input` and `Value` to be scalars (`string`, `number`, `boolean`, `bigint`, `symbol`). Object-shaped validator outputs must use `domain.core.shape`. A runtime guard rejects non-scalar values returned from a primitive validator.

  ### Adapters

  `@xndrjs/domain-zod` and `@xndrjs/domain-valibot` re-export the updated `domain` surface; update call sites that used `domain.capabilities<…>()` to `domain.capabilities.forShape<…>()` (or `forPrimitive` where applicable).

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

  `domain.core.primitive` now requires validator `Input` and `Value` to be scalars (`string`, `number`, `boolean`, `bigint`, `symbol`). Object-shaped validator outputs must use `domain.core.shape`. A runtime guard rejects non-scalar values returned from a primitive validator.

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
