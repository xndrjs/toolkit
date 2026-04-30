---
title: Overview
description: "@xndrjs/domain-zod adapter overview"
order: 1
seeAlso: |
  - [API](./api.md)
  - [Domain overview](/docs/domain/overview)
---

# Zod adapter overview

`@xndrjs/domain-zod` integrates Zod 4 with `@xndrjs/domain`.

It provides:

- `zodToValidator(schema)` to convert Zod schemas into domain validators
- `zodFromKit(...)` helpers to embed domain kits inside Zod schemas
- full re-export of `@xndrjs/domain` for single-entry imports

Use Zod for parsing and transformation, then let `domain` materialize the trusted value.

## Install

```bash
pnpm add @xndrjs/domain-zod zod
```

## When to use

- you already use Zod as main schema layer
- you want domain kits with Zod parsing semantics
- you need bidirectional kit/schema interop

## Minimal example

```typescript
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = domain.primitive(
  "Email",
  zodToValidator(z.email().transform((value) => value.toLowerCase()))
);

const email = Email.create("ADA@EXAMPLE.COM");
```

## Reusing kits in Zod schemas

Use `zodFromKit` when a parent Zod schema should materialize an existing domain kit
instead of duplicating its semantics.

```typescript
import { domain, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const Address = domain.shape(
  "Address",
  zodToValidator(
    z.object({
      city: z.string().min(1),
      country: z.string().length(2),
    })
  )
);

const User = domain.shape(
  "User",
  zodToValidator(
    z.object({
      id: z.string(),
      address: zodFromKit(Address),
    })
  )
);

const user = User.create({
  id: "user_1",
  address: { city: "Rome", country: "IT" },
});
```
