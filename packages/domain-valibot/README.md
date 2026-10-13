# @xndrjs/domain-valibot

Valibot **1.x** adapter for [@xndrjs/domain](../domain). Import `domain` from this package and pass Valibot schemas directly to `domain.shape` / `primitive` / `proof`. Use **`valibotFromKit(kit)`** to compose kits as nested Valibot fields, and **`valibotToValidator(schema)`** when you need an explicit `Validator`.

This package **re-exports `@xndrjs/domain`** (types, `compose`, `pipe`, …). Top-level `domain.shape` / `primitive` / `proof` accept Valibot schemas; `domain.core.*` still takes a `Validator`.

## Install

```bash
pnpm add @xndrjs/domain-valibot valibot
```

## Quickstart

Import from `@xndrjs/domain-valibot` to get the adapted `domain` and adapter helpers.

```ts
import * as v from "valibot";
import { domain } from "@xndrjs/domain-valibot";

const Email = domain.primitive("Email", v.pipe(v.string(), v.email()));
```

```ts
import * as v from "valibot";
import { domain, pipe } from "@xndrjs/domain-valibot";

const ItemSchema = v.object({
  id: v.string(),
  tier: v.picklist(["free", "pro"]),
  count: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

const ProTier = domain
  .proof("ProTier", ItemSchema)
  .refineType((row): row is typeof row & { tier: "pro" } => row.tier === "pro");

const Stocked = domain
  .proof("Stocked", ItemSchema)
  .refineType((row): row is typeof row & { count: number } => row.count > 0);

const out = pipe({ id: "i-1", tier: "pro", count: 4 }, Stocked.assert, ProTier.assert);
```

```ts
import * as v from "valibot";
import { domain, valibotFromKit } from "@xndrjs/domain-valibot";

const Address = domain.shape(
  "Address",
  v.object({
    type: v.optional(v.literal("Address"), "Address"),
    city: v.string(),
  })
);

const User = domain.shape(
  "User",
  v.object({
    type: v.optional(v.literal("User"), "User"),
    address: valibotFromKit(Address),
  })
);
```

## Recipes

### Nested sub-shape composition from kit

- Keep child kits in domain modules and embed them with `valibotFromKit(childKit)`.
- Compose arrays/optionals with normal Valibot operators around `valibotFromKit`.

### Capabilities + patch re-validation

```ts
import * as v from "valibot";
import { domain } from "@xndrjs/domain-valibot";

const UserShape = domain.shape(
  "User",
  v.object({
    type: v.optional(v.literal("User"), "User"),
    displayName: v.string(),
    isVerified: v.boolean(),
  })
);

const User = domain.capabilities.forShapeKit(UserShape).methods(({ patch }) => ({
  verify(user) {
    return patch(user, { isVerified: true });
  },
}));
```

### Cross-engine composition pattern

- Keep the semantic model in `domain` modules.
- Prefer adapter `domain` + native schemas at Valibot boundaries; use `valibotToValidator` when you need an explicit `Validator`.
- Use `valibotFromKit` to compose existing domain kits in Valibot schemas without duplicating domain semantics.

## Pitfalls and design decisions

- Adapter schema ergonomics are not core modeling APIs; core `domain` from `@xndrjs/domain` still requires a `Validator`.
- `is` checks depend on shape prototype markers; JSON transport strips prototype, so re-enter via `create`.
- Use proofs and `pipe` for explicit guarantee chains instead of manual narrowing.

## License

MIT
