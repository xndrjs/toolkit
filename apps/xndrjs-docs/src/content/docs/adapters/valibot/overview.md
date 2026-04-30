---
title: Overview
description: "@xndrjs/domain-valibot adapter overview"
order: 1
seeAlso: |
  - [API](./api.md)
---

# Valibot adapter overview

`@xndrjs/domain-valibot` integrates Valibot schemas with `@xndrjs/domain`.

It provides:

- `valibotToValidator(schema)` to produce domain validators
- `valibotFromKit(kit)` to use domain kits as Valibot schema fields
- full `@xndrjs/domain` re-export for convenience imports

## Install

```bash
pnpm add @xndrjs/domain-valibot valibot
```

## Minimal example

```typescript
import * as v from "valibot";
import { domain, valibotToValidator } from "@xndrjs/domain-valibot";

const Email = domain.primitive("Email", valibotToValidator(v.pipe(v.string(), v.email())));

const email = Email.create("dev@example.com");
```

## Reusing kits in Valibot schemas

```typescript
import * as v from "valibot";
import { domain, valibotFromKit, valibotToValidator } from "@xndrjs/domain-valibot";

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
