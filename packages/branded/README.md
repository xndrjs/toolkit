# @xndrjs/branded

Zod-first domain modeling with a tiny surface: define schema once, get validated values, nominal safety, immutable entities, and explicit proof steps.

## Philosophy

`@xndrjs/branded` is built for teams that want domain code to stay boring and safe:

- Zod remains the source of truth for runtime invariants.
- `create` is the validation gate: no branded value without successful parsing.
- Shapes are immutable after creation/patch; **capabilities** (former “methods”) live on the **kit** as functions that take the entity as the first argument — no implicit `this`.
- **Proofs** (`branded.proof`) make extra guarantees explicit (`parse` / `safeParse` / `refineType`) instead of ad-hoc casts.

The goal is **simplicity with guardrails**.

## Installation

`zod` is a **peer dependency** (Zod **4.x**). Install it alongside this package so your app uses a single Zod instance.

```bash
npm install @xndrjs/branded zod@^4
```

**Runtime:** Node.js **18+** (see `engines` in `package.json`). The monorepo that builds this library may use a stricter Node version; consumers are not required to match it.

## Quick examples

### 1) Primitive: validated + nominal

```ts
import { z } from "zod";
import { branded, BrandedType } from "@xndrjs/branded";

const EmailPrimitive = branded.primitive(
  "Email",
  z
    .string()
    .email()
    .transform((v) => v.toLowerCase())
);
type Email = BrandedType<typeof EmailPrimitive>;

const ok: Email = EmailPrimitive.create("DEV@COMPANY.COM");
// ok === "dev@company.com" at runtime, but with nominal typing in TS
```

### 2) Shape: schema-only kit + `capabilities`, frozen instances

`branded.shape(name, schema)` returns a **schema-only** kit. **`patch`** is kept **non-enumerable** on the kit (see `__shapePatch` in advanced section); orchestration code cannot import a loose `patch` unless you expose it.

Add behavior with the fluent builder **`branded.capabilities<Req>().methods((patch) => ({ … }))`**, then attach it to a shape via **`.attach(shape)`**. Capability functions are **kit methods** `User.markVerified(user, …)` — no `this`. Instances stay **frozen** rows with a shape marker on the prototype; **`JSON.stringify(user)`** is data-only.

Reserved capability keys (you cannot use these as method names): `create`, `is`, `extend`, `schema`, `type`, `project`.

```ts
// user.ts — export the capability kit; `patch` stays inside the factory closure
import { z } from "zod";
import { branded, BrandedType } from "@xndrjs/branded";

const UserShape = branded.shape(
  "User",
  z.object({
    type: z.literal("User").default("User"),
    email: z.email(),
    isVerified: z.boolean(),
  })
);

const UserCapability = branded
  .capabilities<{ email: string; isVerified: boolean }>()
  .methods((patch) => ({
    markVerified(user) {
      return patch(user, { isVerified: true });
    },
  }));

const User = UserCapability.attach(UserShape);

export { User };
export type UserEntity = BrandedType<typeof User>;

const user = User.create({ email: "dev@company.com", isVerified: false });
const next = User.markVerified(user);

Object.isFrozen(next); // true
next.isVerified; // true
```

### 3) Proof: nominal guarantee + optional `refineType`

Use **`branded.proof`** to attach a **brand** and optional **type refinement** on top of Zod validation. **`parse` / `safeParse`** accept the same inputs as the schema; for **shape entities**, the original prototype is preserved.

```ts
const VerifiedUserFact = branded
  .proof("VerifiedUser", UserShape.schema)
  .refineType<{ isVerified: true }>((u) => u.isVerified === true);

const user = User.create({ email: "dev@company.com", isVerified: true });
const proven = VerifiedUserFact.parse(user);
VerifiedUserFact.is(proven); // true
```

## Best practices encouraged by the kit

1. Validate at boundaries with `create`.
2. Keep domain transitions in **kit** methods (`UserKit.op(user, …)`), not ad-hoc free functions.
3. Use `patch` for controlled, re-validated updates.
4. Add explicit discriminants (`type: z.literal("...")`) to shapes.
5. Use proofs as explicit guarantee steps at use-case boundaries when you need a stronger type than the base shape.
6. Prefer shape **`create(raw)`** at boundaries; use **`proof.parse(entity)`** when asserting an in-memory value satisfies extra constraints.

## Positioning: why this model

`@xndrjs/branded` sits between two common extremes.

### A) Plain mutable records (DTO-style)

**Pros**

- Very low initial friction.
- Easy JSON serialization and transport across domain, orchestration, and infrastructure.
- Minimal abstraction overhead for small projects.

**Cons**

- Invariants are scattered (often duplicated across UI, orchestration, and infrastructure).
- Mutability makes state transitions harder to reason about and easier to break accidentally.
- Type-level guarantees are weak: invalid intermediate states can leak between layers.
- Long-term maintenance cost grows quickly as the model evolves.

### B) Rich class-based domain model

**Pros**

- Behavior is close to data; invariants can be strongly encapsulated.
- Great for complex domain logic and explicit ubiquitous language.
- Potentially excellent consistency inside the domain boundary.

**Cons**

- High mapping pressure at boundaries (DTOs, mappers, hydration/dehydration pipelines).
- Boilerplate grows with model size and number of integration points.
- Class instances can create friction with modern FE patterns and ecosystems that rely on plain objects, serialization, and referential integrity assumptions.
- Tooling interoperability (validation, transport, caching) is often less direct than schema-first approaches.

### What `@xndrjs/branded` optimizes for

- **Static + runtime guarantees together**: nominal typing (`Branded`) plus Zod-backed validation.
- **Low-friction layer flow**: shape instances are already plain, JSON-friendly objects; move them across domain, orchestration, and infrastructure without stripping methods or extra DTO layers.
- **Controlled mutability model**: entities are frozen; updates go through `patch` + validation (typically inside capability functions).
- **Explicit state progression**: proofs model extra guarantees without forcing heavy class hierarchies.
- **DDD power with less ceremony**: keep strong boundaries and invariants while avoiding much of the boilerplate typical of DTO/mapper-heavy setups.

In short, the package aims to improve scalability and maintainability as the codebase grows, while keeping developer experience fast and pragmatic.

## Core building blocks

### Primitive

`branded.primitive(name, schema)` creates a kit with:

- `create(raw)`
- `is(value)`
- `schema`
- `type`

Runtime value stays a plain primitive; nominal distinction is type-level.

### Shape

`branded.shape(name, schema)` returns a kit with `create`, `is`, `extend`, `schema`, `type`, **`project(entity, targetKit)`**. **`patch`** is internal (non-enumerable); use **`branded.capabilities`** to close over it.

`kit.extend(nextName, (baseSchema) => ({ schema: nextSchema }))` returns a new schema-only kit.

### Capabilities

`branded.capabilities<Req>().methods((patch) => methods).attach(shape)` creates reusable capability bundles and attaches them to compatible shapes. Each method **`(entity, ...args)`** takes the shape row as **`entity`** (`ShapeRow<schema>`), and `patch` is validated by the attached shape schema.

### Field

`branded.field(childKit)` embeds branded primitive/shape schemas in parent shapes so raw nested input can be created in one shot.

### Proof

`branded.proof(brand, schema)` returns a builder with optional **`refineType<Patch>(guard)`** (narrows output to **`z.output<Schema> & Patch`**). The resulting kit exposes **`brand`**, **`parse`**, **`safeParse`**, **`is`**, **`schema`**.

## Error Preset: `baseErrorSchema`

`presets` is exported from the API with reusable shape presets for common cases.

```ts
import { presets } from "@xndrjs/branded";

const [UserNotFoundShape] = presets.ErrorShape.extend("UserNotFound", (base) =>
  base.extend({ metadata: z.object({ id: z.string() }) })
);

const err = UserNotFoundShape.create({
  code: "USER_NOT_FOUND",
  message: "Unknown user",
  metadata: { id: "u-1" },
});
```

## Library Errors (Exceptions)

| Error class              | Typical trigger                                              |
| ------------------------ | ------------------------------------------------------------ |
| `BrandedValidationError` | Invalid input on `create` / `patch` / nested `field` parsing |
| `BrandedError`           | Base error type with stable `code`                           |

`BrandedValidationError` exposes `issues`, `zodError`, `flatten()`, and `treeify()`.

## Advanced: `__brand`, `__shapeMarker`, `__shapePatch`

The root export includes these **symbols** mainly for declaration emit and rare interop (for example avoiding TS4023 in some `declaration: true` setups, or reaching `patch` only when you cannot use `branded.capabilities`).

Most application/domain code should never import them directly.

If useful, enforce this via ESLint:

```js
{
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@xndrjs/branded",
            importNames: ["__brand", "__shapeMarker", "__shapePatch"],
          },
        ],
      },
    ],
  },
}
```

## Caveats

- No runtime `__brand` field is injected into primitives/shapes.
- JSON round-trip strips shape prototype; use `create` to re-enter the domain.
- This package is intentionally small: domain modeling helpers, not ORM/entity framework.

## License

MIT
