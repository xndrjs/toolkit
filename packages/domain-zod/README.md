# @xndrjs/domain-zod

Zod **4.x** adapter for [@xndrjs/domain](../domain). Use **`zodToValidator(schema)`** for a `Validator<input, output>`, and **`zodFromKit(kit)`** to compose core kits as nested Zod fields.

Prefer this package over the deprecated [`@xndrjs/branded`](../branded) for Zod-first domain modeling. **Further validation adapters** for `@xndrjs/domain` are **on the roadmap** (several likely in the near term).

This package **re-exports `@xndrjs/domain`** (`domain`, `compose` + types), so you can import from one place when you use Zod.

## Install

```bash
pnpm add @xndrjs/domain-zod zod@^4
```

`@xndrjs/domain` is a direct dependency of this package; you do not have to add it separately unless you want to pin its version explicitly.

## Usage

Import **`domain`**, **`zodToValidator`**, and **`zodFromKit`** from this package; import `z` from `"zod"`. Modeling factories live on **`domain`**; `compose`, `pipe`, and `DomainValidationError` come from the root re-export of `@xndrjs/domain`.

## Quickstart (step 2 in the stack)

### Primitive

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = domain.primitive("Email", zodToValidator(z.email()));
const email = Email.create("a@b.com");
```

### Shape

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const User = domain.shape(
  "User",
  zodToValidator(
    z.object({
      type: z.literal("User").default("User"),
      id: z.string(),
    })
  )
);
const user = User.create({ id: "u-1" });
```

### Nested composition from existing kits

```ts
import { domain, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const Address = domain.shape(
  "Address",
  zodToValidator(z.object({ type: z.literal("Address").default("Address"), city: z.string() }))
);

const User = domain.shape(
  "User",
  zodToValidator(
    z.object({
      type: z.literal("User").default("User"),
      address: zodFromKit(Address),
    })
  )
);
```

### Proof

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const Verified = domain.proof("Verified", zodToValidator(z.object({ ok: z.literal(true) })));
```

### Proof + refineType + pipe

```ts
import { domain, pipe, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const ItemSchema = z.object({
  id: z.string(),
  tier: z.enum(["free", "pro"]),
  count: z.number().int().nonnegative(),
});

const ProTier = domain
  .proof("ProTier", zodToValidator(ItemSchema))
  .refineType((row): row is typeof row & { tier: "pro" } => row.tier === "pro");

const Stocked = domain
  .proof("Stocked", zodToValidator(ItemSchema))
  .refineType((row): row is typeof row & { count: number } => row.count > 0);

const out = pipe({ id: "i-1", tier: "pro", count: 4 }, Stocked.assert, ProTier.assert);
```

### Capabilities

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const UserShape = domain.shape(
  "User",
  zodToValidator(z.object({ id: z.string(), isVerified: z.boolean() }))
);
const User = domain
  .capabilities<{ isVerified: boolean }>()
  .methods((patch) => ({
    verify(u) {
      return patch(u, { isVerified: true });
    },
  }))
  .attach(UserShape);
```

## Recipes

### Nested sub-shape composition from kit

- Define child kits once with `domain.shape(...)`.
- Reference them in parent schemas via `zodFromKit(childKit)`.
- Keep all shape semantics in `domain`, not inside ad-hoc schema fragments.

### Capabilities + patch re-validation

- Attach capability bundles with `domain.capabilities().methods(...).attach(shape)`.
- Use the provided `patch` closure for every transition, so updates are always revalidated by the shape validator.

### Cross-engine composition pattern

- Keep core model modules adapter-agnostic.
- Use `zodToValidator` only at IO boundaries that already use Zod.
- If another boundary needs a different engine, keep the same kits and swap adapter package.

## Pitfalls and design decisions

- Avoid treating adapter schema APIs as domain extension APIs; extension belongs to adapter schema composition, not to core kit internals.
- `is` checks are prototype/marker based; data after JSON roundtrip must be recreated with `create`.
- Prefer explicit proof steps (`proof.assert`/`pipe`) over unchecked casts.

## Validation errors

Zod failures become **`DomainValidationError`** with `failure.engine === "zod"`, `failure.issues` normalized for the domain core, and `failure.raw` holding the original `ZodError` when useful for tooling.

## License

MIT
