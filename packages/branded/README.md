# @xndrjs/branded

**Zod-first branded types** for domain modeling: you keep a **single source of truth** (your Zod schemas), and the library turns them into **nominal**, **validated** domain values with almost no ceremony.

## Philosophy

Most “branded types” tutorials stop at `type Email = string & { __brand: 'Email' }`. That buys you a compile-time label, but not **runtime safety**, **consistent parsing**, or **clear boundaries** between raw input and domain values.

`@xndrjs/branded` is built around a different trade-off:

- **Enforce good habits by default** — validation, immutability for aggregates, runtime discriminants for shapes, typed refinements — **without** asking you to hand-roll `parse`, `assert`, `brand`, and error types on every new type.
- **Stay close to Zod** — you already express invariants in schemas; the kit wires `safeParse`, throws **`BrandedValidationError`** with **`issues`**, and exposes the same **`schema`** for composition.
- **Keep the public surface small** — main usage is `branded.*` + shared types/errors; **`__brand`** and **`__anemicOutput`** are also exported from the root entry for declaration emit and rare tooling needs (see below).

## Installation

```bash
npm install @xndrjs/branded zod
```

`zod` is a **peer-style** dependency: you bring the version your app uses; the package imports it directly.

## `__brand` / `__anemicOutput` (advanced)

The package root exports **`__brand`** and **`__anemicOutput`**: the same runtime `unique symbol` keys used by public types such as `Branded` and `AnemicOutput`.

**Why:** dependent projects with **`declaration: true`** need these symbols to be **exported and nameable** so TypeScript can emit `.d.ts` for your own exports (e.g. avoids **TS4023** when re-exporting kits whose types mention `Branded`).

**When to import them:** only in **tests, tooling, or framework code** that must assert on brand metadata. Avoid using them in normal application/domain code.

### ESLint: forbid these names in app source

Use **`no-restricted-imports`** with **`paths`** + **`importNames`** so normal code still imports `branded`, types, and errors from `@xndrjs/branded`, but not the symbol exports.

**Flat config (`eslint.config.js`)** — example: restrict for all TS under `src/`, except tests:

```js
{
  files: ["src/**/*.ts"],
  ignores: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@xndrjs/branded",
            importNames: ["__brand", "__anemicOutput"],
            message:
              "Do not import __brand / __anemicOutput in application code; use only in tests or tooling.",
          },
        ],
      },
    ],
  },
},
```

**Legacy `.eslintrc.cjs`** — same idea with `overrides` for test globs setting `no-restricted-imports` to `off` if you prefer a global ban with exceptions.

## Concepts

### Primitive

A **single runtime value** (string, number, …) validated and treated as a distinct type (e.g. `Email`). **Nominal distinction is type-level only**: at runtime the value is a plain primitive; there is no `__brand` field (unlike shapes / refined objects).  
API: `branded.primitive(typeName, zodSchema)` → `{ create, is, schema, type }`.

### Shape (entity / value object)

A **readonly object** with a **runtime `type` discriminant** and an internal brand map. **`create`** validates and **freezes** the instance; **`is`** checks discriminant + brand, not just Zod shape (so plain parsed JSON does not “count” as domain). **`patch`** removes `type` and `__brand` from the working copy before Zod runs, then reapplies validated props, the discriminant, and the entity’s existing `__brand` so a delta cannot “stick” forged metadata.

API: `branded.shape(typeName, z.object({ ... }), { methods: { … } })` → **tuple** `[kit, patch]` where `kit` has `create`, `is`, `schema`, `type`, and **`patch`** re-validates after applying a **`PatchDelta`** (partial props or draft callback). The **`methods`** object is **required** (use `{ methods: {} }` when the entity has no instance methods).

### Field

Embeds another branded **primitive** or **shape kit** into a parent Zod object so you can **`create` the parent from raw nested input** in one go: the child’s schema runs inside the parent’s `object` schema.

API: `branded.field(childKit)` inside `z.object({ ... })`.

### Refinement

Adds a **second brand** and **TypeScript narrowing** on top of an existing shape when a **type predicate** holds — e.g. `User` → `VerifiedUser` with stricter fields. Refinements **do not define instance methods**; behavior stays on the **base shape** (`branded.shape(…, { methods })`).  
API: `branded.refine(baseKit).when((user): user is NarrowData => …).as(brandName)` — narrow type comes from the **`when`** type guard only; do not hand-write `Branded<Brand, …>` for the row (the kit applies the brand on **`kit.from`**). → `{ brand, is, from, tryFrom }`.  
Invalid refinement: **`kit.from`** throws **`BrandedRefinementError`**; **`tryFrom`** returns `null`.

### Types

- **`BrandedType<typeof kit>`** — value type from **`kit.create`** (primitive/shape) or **`kit.from`** (refinement).
- **`Branded<Brand, T>`** — nominal brand `Brand` over base type `T` (same argument order as `primitive` / `shape`: name first).
- **`BrandOf<T>`** — extracts the brand literal from a `Branded<Brand, …>` type.
- **`RefinementInstance<TBase, Brand, NewType>`** — refinement value type (`TBase` + refinement brand + narrowed data); matches **`from`** / **`tryFrom`**. Instance methods are only those from the shape prototype.
- **`BrandedMethodDefinitions`** / **`BrandedMethodSurface<M, RowHost>`** — method bags for **shape** `methods` only; patch-delegating methods are surfaced as `<T extends …>(…) => T` so refinements on `this` are preserved.
- **`BrandedPrimitive<Brand, T>`** / **`BrandedShape<Brand, Props>`** — aliases for primitives and shapes.
- **`PatchDelta<T>`** — partial `T` or `(draft: Mutable<T>) => void`; argument type for shape **`patch`**.

## Examples

### Email primitive

```ts
import { z } from "zod";
import { branded, BrandedType, BrandedValidationError } from "@xndrjs/branded";

const EmailSchema = z
  .string()
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
  .transform((v) => v.toLowerCase());

const Email = branded.primitive("Email", EmailSchema);
type Email = BrandedType<typeof Email>;

const email = Email.create("USER@EXAMPLE.COM"); // validated + normalized
Email.is(email); // true — still checks schema, not just typeof string

// BrandedValidationError with .issues / .zodError on failure
try {
  Email.create("not-an-email");
} catch (e) {
  if (e instanceof BrandedValidationError) {
    console.log(e.issues);
  }
}
```

### Nested shapes and `field` (one-shot create from raw input)

```ts
const EmailSchema = z
  .string()
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
  .transform((v) => v.toLowerCase());

const Email = branded.primitive("Email", EmailSchema);
type Email = BrandedType<typeof Email>;

const [AddressShape] = branded.shape(
  "Address",
  z.object({
    city: z.string(),
    street: z.string(),
  }),
  { methods: {} }
);

const [UserShape, patchUser] = branded.shape(
  "User",
  z.object({
    email: branded.field(Email),
    address: branded.field(AddressShape),
  }),
  { methods: {} }
);

type User = BrandedType<typeof UserShape>;

// Raw nested input: children validated and branded by Zod + kits
const user = UserShape.create({
  email: "hello@example.com",
  address: { street: "Via Roma 1", city: "Florence" },
});

user.type; // "User"
Object.isFrozen(user); // true — entity-style immutability

const next = patchUser(user, { email: Email.create("other@example.com") });
```

### Refinement: optional → guaranteed (`tryFrom` / `from`)

```ts
import { branded, BrandedType } from "@xndrjs/branded";

const UserSchema = z.object({
  id: z.string(),
  isVerified: z.boolean(),
  additionalData: z.string().optional(),
});

const [User] = branded.shape("User", UserSchema, {
  methods: {
    // optional methods
  },
});
type UserEntity = BrandedType<typeof User>;

type VerifiedUserData = UserEntity & { isVerified: true; additionalData: string };

const VerifiedUserRefinement = branded
  .refine(User)
  .when(
    (user): user is VerifiedUserData =>
      // validate properties with simple checks, or use a dedicated Zod schema + safeParse
      user.isVerified === true && typeof user.additionalData === "string"
  )
  .as("VerifiedUser");

type VerifiedUser = BrandedType<typeof VerifiedUserRefinement>;

const user = User.create({
  id: "u-1",
  isVerified: true,
  additionalData: "present",
});

const verified: VerifiedUser = VerifiedUserRefinement.from(user); // throws BrandedRefinementError if predicate fails
const maybe = VerifiedUserRefinement.tryFrom(user); // null if not refined
```

## Errors

| Class                    | When                                                            |
| ------------------------ | --------------------------------------------------------------- |
| `BrandedValidationError` | `create` / `patch` / field parsing fails Zod validation         |
| `BrandedRefinementError` | `kit.from` on a refinement kit when the type predicate is false |
| `BrandedError`           | Base class with `code` for both cases above                     |

Validation errors expose **`issues`** and **`zodError`**, plus **`flatten()`** (`z.flattenError`) and **`treeify()`** (`z.treeifyError`) for Zod 4–aligned field and tree-shaped reporting (avoids deprecated `ZodError#flatten` / `#format`).

## Best practices this kit nudges you toward

1. **Validate at the boundary** — `create` is the gate; you don’t get a branded value without a successful parse.
2. **Nominal typing** — at the type level, primitives and shapes are not interchangeable; primitives stay plain values at runtime, shapes carry `type` + `__brand`.
3. **Immutable aggregates** — shapes are **`Object.freeze`d** after `create` / `patch`; changes go through **`patch`** and re-validation.
4. **Explicit domain discriminants** — every shape carries **`type: '<Name>'`**, useful for unions and logging.
5. **Composition without duplication** — **`field`** reuses child schemas so nested raw input stays ergonomic.
6. **Refinements as proof steps** — **`from` / `tryFrom`** make “verified” states explicit instead of scattered `if` + casts.
7. **Structured failures** — Zod errors are wrapped once, with a stable **`BrandedValidationError`** type.
8. **Honest runtime checks** — **`is`** for shapes encodes brand + discriminant, so re-hydrated JSON isn’t mistaken for domain until you **`create`** again.

## Caveats

- **Primitives vs objects**: runtime `__brand` exists on **shapes** and **refinement results** (objects), not on **primitive** scalars.
- **Serialization**: `JSON.stringify` / `parse` drops the internal brand on objects; **`User.is(parsedJson)`** is **`false`** until you construct again with **`create`** (by design).
- **Library scope**: this is a small kit around Zod + nominal branding — not a full entity framework or ORM layer.

## License

MIT
