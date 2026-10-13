# @xndrjs/domain-zod

Zod **4.x** adapter for [@xndrjs/domain](../domain). Import `domain` from this package and pass Zod schemas directly to `domain.shape` / `primitive` / `proof`. Use **`zodFromKit(kit)`** to compose kits as nested Zod fields, and **`zodToValidator(schema)`** when you need an explicit `Validator`.

This package **re-exports `@xndrjs/domain`** (types, `compose`, `pipe`, …). Top-level `domain.shape` / `primitive` / `proof` accept Zod schemas; `domain.core.*` still takes a `Validator`.

## Install

```bash
pnpm add @xndrjs/domain-zod zod@^4
```

`@xndrjs/domain` is a direct dependency of this package; you do not have to add it separately unless you want to pin its version explicitly.

## Usage

Import **`domain`** and **`zodFromKit`** from this package; import `z` from `"zod"`. Modeling factories live on **`domain`**; `compose`, `pipe`, and `DomainValidationError` come from the root re-export of `@xndrjs/domain`.

## Quickstart

### Primitive

```ts
import { domain } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = domain.primitive("Email", z.email());
const email = Email.create("a@b.com");
```

### Shape

```ts
import { domain } from "@xndrjs/domain-zod";
import { z } from "zod";

const User = domain.shape(
  "User",
  z.object({
    type: z.literal("User").default("User"),
    id: z.string(),
  })
);
const user = User.create({ id: "u-1" });
```

### Nested composition from existing kits

```ts
import { domain, zodFromKit } from "@xndrjs/domain-zod";
import { z } from "zod";

const Address = domain.shape(
  "Address",
  z.object({ type: z.literal("Address").default("Address"), city: z.string() })
);

const User = domain.shape(
  "User",
  z.object({
    type: z.literal("User").default("User"),
    address: zodFromKit(Address),
  })
);
```

### Proof

```ts
import { domain } from "@xndrjs/domain-zod";
import { z } from "zod";

const Verified = domain.proof("Verified", z.object({ ok: z.literal(true) }));
```

### Proof + refineType + pipe

```ts
import { domain, pipe } from "@xndrjs/domain-zod";
import { z } from "zod";

const ItemSchema = z.object({
  id: z.string(),
  tier: z.enum(["free", "pro"]),
  count: z.number().int().nonnegative(),
});

const ProTier = domain
  .proof("ProTier", ItemSchema)
  .refineType((row): row is typeof row & { tier: "pro" } => row.tier === "pro");

const Stocked = domain
  .proof("Stocked", ItemSchema)
  .refineType((row): row is typeof row & { count: number } => row.count > 0);

const out = pipe({ id: "i-1", tier: "pro", count: 4 }, Stocked.assert, ProTier.assert);
```

### Capabilities

```ts
import { domain } from "@xndrjs/domain-zod";
import { z } from "zod";

const UserShape = domain.shape("User", z.object({ id: z.string(), isVerified: z.boolean() }));
const User = domain.capabilities.forShapeKit(UserShape).methods(({ patch }) => ({
  verify(u) {
    return patch(u, { isVerified: true });
  },
}));
```

### Explicit `zodToValidator`

Still available when you need a standalone `Validator` (compose, shared boundaries, or core `@xndrjs/domain`):

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const userValidator = zodToValidator(z.object({ id: z.string() }));
const User = domain.core.shape("User", userValidator);
```

## Recipes

### Nested sub-shape composition from kit

- Define child kits once with `domain.shape(...)`.
- Reference them in parent schemas via `zodFromKit(childKit)`.
- Keep all shape semantics in `domain`, not inside ad-hoc schema fragments.

### Capabilities + patch re-validation

- Prefer `domain.capabilities.forShapeKit(shape).methods(...)` when the kit is in scope.
- Use `forShapeContract<Slice>().methods(...).attach(shape)` for minimal/shared contracts.
- Use the provided `patch` closure for every transition, so updates are always revalidated by the shape validator.

### Cross-engine composition pattern

- Keep core model modules adapter-agnostic when mixing engines.
- Prefer adapter `domain` + native schemas at Zod boundaries; use `zodToValidator` only when you need an explicit `Validator`.
- If another boundary needs a different engine, keep the same kits and swap adapter package.

## Pitfalls and design decisions

- Adapter schema ergonomics are not core modeling APIs; core `domain` from `@xndrjs/domain` still requires a `Validator`.
- `is` checks depend on shape prototype markers; JSON transport strips prototype, so re-enter via `create`.
- Use proofs and `pipe` for explicit guarantee chains instead of manual narrowing.

## License

MIT
