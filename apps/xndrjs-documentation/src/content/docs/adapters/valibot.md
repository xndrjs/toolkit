---
title: Valibot adapter
description: Use Valibot schemas as xndrjs domain validators.
---

`@xndrjs/domain-valibot` integrates Valibot schemas with `@xndrjs/domain`.

It provides:

- `valibotToValidator(schema)` to produce domain validators
- `valibotFromKit(kit)` to use domain kits as Valibot schema fields
- full re-export of `@xndrjs/domain` for convenient imports

## Install

```bash
pnpm add @xndrjs/domain-valibot valibot
```

## Minimal example

```ts
import * as v from "valibot";
import { domain, valibotToValidator } from "@xndrjs/domain-valibot";

const Email = domain.primitive("Email", valibotToValidator(v.pipe(v.string(), v.email())));

const email = Email.create("dev@example.com");
```

## valibotToValidator

Wrap any compatible Valibot schema into the domain validator contract:

```ts
const User = domain.shape(
  "User",
  valibotToValidator(
    v.object({
      id: v.pipe(v.string(), v.minLength(1)),
      email: valibotFromKit(Email),
    })
  )
);
```

## valibotFromKit

Use `valibotFromKit` when a parent Valibot schema should materialize an existing primitive or shape kit.

```ts
const Address = domain.shape(
  "Address",
  valibotToValidator(
    v.object({
      city: v.pipe(v.string(), v.minLength(1)),
      country: v.pipe(v.string(), v.length(2)),
    })
  )
);

const User = domain.shape(
  "User",
  valibotToValidator(
    v.object({
      id: v.string(),
      address: valibotFromKit(Address),
    })
  )
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
