# @xndrjs/domain-valibot

Valibot **1.x** adapter for [@xndrjs/domain](../domain). Use **`valibotToValidator(schema)`** for a `Validator<input, output>`, and **`valibotFromKit(kit)`** to compose core kits as nested Valibot fields.

This package **re-exports `@xndrjs/domain`** (`domain`, `compose` + types), so you can import from one place when you use Valibot.

## Install

```bash
pnpm add @xndrjs/domain-valibot valibot
```

## Quickstart (step 3 in the stack)

Import from `@xndrjs/domain-valibot` to get both the adapter helpers and the `domain` re-export.

```ts
import * as v from "valibot";
import { domain, valibotToValidator } from "@xndrjs/domain-valibot";

const Email = domain.primitive("Email", valibotToValidator(v.pipe(v.string(), v.email())));
```

```ts
import * as v from "valibot";
import { domain, pipe, valibotToValidator } from "@xndrjs/domain-valibot";

const ItemSchema = v.object({
  id: v.string(),
  tier: v.picklist(["free", "pro"]),
  count: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

const ProTier = domain
  .proof("ProTier", valibotToValidator(ItemSchema))
  .refineType((row): row is typeof row & { tier: "pro" } => row.tier === "pro");

const Stocked = domain
  .proof("Stocked", valibotToValidator(ItemSchema))
  .refineType((row): row is typeof row & { count: number } => row.count > 0);

const out = pipe({ id: "i-1", tier: "pro", count: 4 }, Stocked.assert, ProTier.assert);
```

```ts
import * as v from "valibot";
import { domain, valibotFromKit, valibotToValidator } from "@xndrjs/domain-valibot";

const Address = domain.shape(
  "Address",
  valibotToValidator(
    v.object({
      type: v.optional(v.literal("Address"), "Address"),
      city: v.string(),
    })
  )
);

const User = domain.shape(
  "User",
  valibotToValidator(
    v.object({
      type: v.optional(v.literal("User"), "User"),
      address: valibotFromKit(Address),
    })
  )
);
```

## Recipes

### Nested sub-shape composition from kit

- Keep child kits in core modules and embed them with `valibotFromKit(childKit)`.
- Compose arrays/optionals with normal Valibot operators around `valibotFromKit`.

### Capabilities + patch re-validation

```ts
import * as v from "valibot";
import { domain, valibotToValidator } from "@xndrjs/domain-valibot";

const UserShape = domain.shape(
  "User",
  valibotToValidator(
    v.object({
      type: v.optional(v.literal("User"), "User"),
      displayName: v.string(),
      isVerified: v.boolean(),
    })
  )
);

const User = domain
  .capabilities<{ displayName: string; isVerified: boolean }>()
  .methods((patch) => ({
    verify(user) {
      return patch(user, { isVerified: true });
    },
  }))
  .attach(UserShape);
```

### Cross-engine composition pattern

- Keep the semantic model in `domain` modules.
- Adapt payload validators per boundary with `valibotToValidator` (or `zodToValidator` where needed).
- Use `valibotFromKit` to compose existing domain kits in Valibot schemas without duplicating domain semantics.

## Pitfalls and design decisions

- Adapter schema ergonomics are not core modeling APIs; keep domain transitions in capabilities/proofs.
- `is` checks depend on shape prototype markers; JSON transport strips prototype, so re-enter via `create`.
- Use proofs and `pipe` for explicit guarantee chains instead of manual narrowing.

## License

MIT
