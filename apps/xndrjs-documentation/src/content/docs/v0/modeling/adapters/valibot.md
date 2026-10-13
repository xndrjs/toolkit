---
title: Valibot adapter
description: Use Valibot schemas with xndrjs domain kits.
---

`@xndrjs/domain-valibot` integrates Valibot schemas with `@xndrjs/domain`.

It provides:

- an adapted `domain` whose top-level `shape` / `primitive` / `proof` accept Valibot schemas; `domain.core.*` still takes a `Validator`
- `valibotToValidator(schema)` when you need an explicit `Validator`
- `valibotFromKit(kit)` to use domain kits as Valibot schema fields
- full re-export of `@xndrjs/domain` for convenient imports (this package’s `domain` shadows core)

## Install

```bash
pnpm add @xndrjs/domain-valibot valibot
```

## Minimal example

```ts
import * as v from "valibot";
import { domain } from "@xndrjs/domain-valibot";

const Email = domain.primitive("Email", v.pipe(v.string(), v.email()));

const email = Email.create("dev@example.com");
```

## Passing schemas to `domain`

Prefer passing Valibot schemas directly:

```ts
const User = domain.shape(
  "User",
  v.object({
    id: v.pipe(v.string(), v.minLength(1)),
    email: valibotFromKit(Email),
  })
);
```

Use `valibotToValidator` when you need a standalone `Validator`.

## valibotFromKit

Use `valibotFromKit` when a parent Valibot schema should materialize an existing primitive or shape kit.

```ts
const Address = domain.shape(
  "Address",
  v.object({
    city: v.pipe(v.string(), v.minLength(1)),
    country: v.pipe(v.string(), v.length(2)),
  })
);

const User = domain.shape(
  "User",
  v.object({
    id: v.string(),
    address: valibotFromKit(Address),
  })
);

const user = User.create({
  id: "user_1",
  address: { city: "Rome", country: "IT" },
});
```

## When Valibot fits well

Valibot is a good match when you want:

- composable function-first schemas
- small boundary parsers
- explicit parser pipelines
- adapter interoperability without changing the domain model
