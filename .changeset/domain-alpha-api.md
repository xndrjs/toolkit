---
"@xndrjs/domain": minor
"@xndrjs/domain-zod": minor
"@xndrjs/domain-valibot": minor
"@xndrjs/domain-ajv": patch
---

### Breaking: `domain.core` factories, adapter native schemas, Kit/Contract capabilities

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
