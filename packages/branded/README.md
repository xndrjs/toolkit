# @xndrjs/branded

Zod-first domain modeling with a tiny surface: define schema once, get validated values, nominal safety, immutable entities, and explicit refinement steps.

## Philosophy

`@xndrjs/branded` is built for teams that want domain code to stay boring and safe:

- Zod remains the source of truth for runtime invariants.
- `create` is the validation gate: no branded value without successful parsing.
- Shapes are immutable after creation/patch and keep behavior on prototype methods.
- Refinements make "proof steps" explicit (`from`, `tryFrom`, `create`) instead of ad-hoc casts.

The goal is **simplicity with guardrails**.

## Installation

```bash
npm install @xndrjs/branded zod
```

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

### 2) Shape: tuple kit + private `patch`, rich model with quasi-anemic payloads

`branded.shape` returns **`[kit, patch]`**. Destructuring lets you **keep `patchUser` inside the module** and export only **`UserShape`**: orchestration code cannot bypass your domain transitions by importing a free `patch` function.

Behavior lives on the **prototype** (non-enumerable), so **`JSON.stringify(user)` stays data-only** — a rich model for your code, practically anemic on the wire. Instances are **frozen**; updates go through **`patch`** (ideally only via semantic methods), which re-validates against the schema.

```ts
// user-shape.ts — export the kit only; `patchUser` never leaves this file
import { z } from "zod";
import { branded, BrandedType } from "@xndrjs/branded";
import { EmailPrimitive } from "./email.primitive";

const [UserShape, patchUser] = branded.shape("User", {
  schema: z.object({
    type: z.literal("User").default("User"),
    email: branded.field(EmailPrimitive),
    isVerified: z.boolean(),
  }),
  methods: {
    markVerified() {
      return patchUser(this, { isVerified: true });
    },
  },
});

export { UserShape };
export type UserEntity = BrandedType<typeof UserShape>;

// Elsewhere — no direct access to patchUser; use the semantic surface
const user = UserShape.create({ email: "dev@company.com", isVerified: false });
const next = user.markVerified();

Object.isFrozen(next); // true
next.isVerified; // true
```

### 3) Refinement: i.e. from optional state to guaranteed state

```ts
type VerifiedUserData = BrandedType<typeof UserShape> & { isVerified: true };

const VerifiedUserRefinement = branded
  .refine(UserShape)
  .when((u): u is VerifiedUserData => u.isVerified === true)
  .as("VerifiedUser");

const verified = VerifiedUserRefinement.create({ email: "dev@company.com", isVerified: true });
// create(raw) = UserShape.create(raw) + refinement check
```

### 4) Refinement chain: one create for multi-step proof

```ts
const AdminReadyUserKit = branded
  .refineChain(VerifiedUserRefinement)
  .with(SomeOtherRefinement)
  .build();

const adminReady = AdminReadyUserKit.create({
  email: "dev@company.com",
  isVerified: true,
  // other raw fields...
});
```

## Best practices encouraged by the kit

1. Validate at boundaries with `create`.
2. Keep entity behavior in shape methods, not free functions spread around.
3. Use `patch` for controlled, re-validated updates.
4. Add explicit discriminants (`type: z.literal("...")`) to shapes.
5. Use refinements as explicit proof transitions in use-cases.
6. Prefer `create(raw)` when entering from external input, `from(existing)` when refining an in-memory domain value.

## Positioning: why this model

`@xndrjs/branded` sits between two common extremes.

### A) Fully anemic + mutable objects

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
- **Low-friction layer flow**: plain-data-friendly shapes and anemic conversion help move data between domain, orchestration (application layer), and infrastructure without mapper explosion.
- **Controlled mutability model**: entities are frozen; updates go through `patch` + validation.
- **Explicit state progression**: refinements model proof steps without forcing heavy class hierarchies.
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

`branded.shape(name, { schema, methods })` returns `[kit, patch]`.

`kit.extend(name, (baseSchema, baseMethods) => ({ schema, methods? }))` returns a new `[kit, patch]`.
`methods` can be an object (explicit methods only) or a factory `(baseMethods) => ({ ... })` for explicit composition.

`kit` has `create`, `is`, `extend`, `schema`, `type`; `patch(entity, delta)` applies delta + re-validates.

### Field

`branded.field(childKit)` embeds branded primitive/shape schemas in parent shapes so raw nested input can be created in one shot.

### Refinement

`branded.refine(baseKit).when(typeGuard).as(brandName)` creates a refinement kit with:

- `brand`
- `create(raw)` (build from raw then refine)
- `from(baseValue)` (refine existing value or throw)
- `tryFrom(baseValue)` (refine existing value or `null`)
- `is(value)`

### Refinement chain

`branded.refineChain(r1).with(r2).with(r3).build()` returns a combined kit with:

- `create(raw)`
- `from(baseValue)`
- `tryFrom(baseValue)`
- `is(value)`

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
| `BrandedRefinementError` | Refinement predicate failed in `from` / `create`             |
| `BrandedError`           | Base error type with stable `code`                           |

`BrandedValidationError` exposes `issues`, `zodError`, `flatten()`, and `treeify()`.

## Advanced: `__brand` and `__anemicOutput`

The root export includes `__brand` and `__anemicOutput` mainly for declaration emit/tooling edge-cases (for example avoiding TS4023 in some `declaration: true` setups).

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
            importNames: ["__brand", "__anemicOutput"],
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
