---
title: Zod adapter
description: Use Zod schemas as xndrjs domain validators.
---

`@xndrjs/domain-zod` integrates Zod 4 with `@xndrjs/domain`.

It provides:

- `zodToValidator(schema)` to convert a Zod schema into a domain validator
- `zodFromKit(kit)` to embed domain kits inside Zod schemas
- full re-export of `@xndrjs/domain` for single-entry imports

## Install

```bash
pnpm add @xndrjs/domain-zod zod
```

## Minimal example

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = domain.primitive(
  "Email",
  zodToValidator(z.email().transform((value) => value.toLowerCase()))
);

const email = Email.create("ADA@EXAMPLE.COM");
```

Zod handles parsing and transformation. The domain primitive materializes the trusted value.

## zodToValidator

```ts
const userValidator = zodToValidator(
  z.object({
    id: z.string(),
    age: z.number().int().nonnegative(),
  })
);

const User = domain.shape("User", userValidator);
```

Failure mapping:

- `engine: "zod"`
- one domain issue per Zod issue
- raw issue payload available in metadata

## zodFromKit

`zodFromKit(kit)` turns a primitive or shape kit into a Zod field. Validation and transforms run **only** through the kit’s `validator` (typically from `zodToValidator` on the kit); the parent schema does not add a second parsing path for that field.

```ts
const Invite = domain.shape(
  "Invite",
  zodToValidator(
    z.object({
      recipient: zodFromKit(Email),
      message: z.string().min(1),
    })
  )
);
```

## Reusing shapes in parent schemas

```ts
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

This avoids duplicating nested domain semantics in parent schemas.
