# @xndrjs/domain-demo

**Not published** — this app is `private` and listed in `.changeset/config.json` `ignore`, so it is excluded from Changesets versioning and from npm publish on both stable and alpha releases.

Small **workshop checkout** for `@xndrjs/domain`: one cohesive module tree that models a domain with primitives, shapes, proofs, and capabilities.

One of the points it covers is **validator interoperability**: validation boundaries intentionally mix **core**, **Zod**, and **Valibot** — the way a real app might pick a library per layer rather than standardizing on one stack.

## Layout

```
src/domain/
  validators/     # hand-written core validators (money, user baseline for proofs)
  primitives/     # Email (Zod), Money (core)
  shapes/         # User (Valibot + valibotFromKit), Profile (Zod), UserContact (core compose)
  proofs/         # VerifiedUser (core)
  capabilities/   # User (forShapeKit), Money (forPrimitiveKit)
  index.ts        # public surface
src/domain.test.ts
```

## Run tests

From the repo root:

```bash
pnpm --filter @xndrjs/domain-demo test
```

Or typecheck only:

```bash
pnpm --filter @xndrjs/domain-demo typecheck
```

## What this demonstrates

- **Domain modeling** with primitives, shapes, proofs, and capabilities on one module tree.
- **Validator interoperability** across engines on the same domain types:
  - **Zod** at `EmailPrimitive` and `ProfileShape` (including `zodFromKit` for nested email).
  - **Valibot** at `UserShape` with `valibotFromKit(EmailPrimitive)` for the same email boundary.
  - **Core** at `MoneyPrimitive`, `UserContactShape`, proof baseline validators, and `VerifiedUserProof`.
- **Capabilities** attached to kits like in application code (`User.verify`, `Money.add`).
- **Vitest** imports `./domain` and exercises create, capabilities, proof, and `project` — not three parallel “stacks” for parity.
