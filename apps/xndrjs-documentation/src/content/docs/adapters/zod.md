---
title: Zod adapter
description: Use Zod schemas as xndrjs domain validators.
---

`@xndrjs/domain-zod` integrates Zod 4 with `@xndrjs/domain`.

It provides:

- `zodToValidator(schema)` to convert a Zod schema into a domain validator
- `zodFromKit(...)` to embed domain kits inside Zod schemas
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

`zodFromKit` converts a domain kit into a Zod field.

```ts
zodFromKit(kit);
zodFromKit(schema, kit);
```

Use the one-argument form when the field should validate directly through the kit:

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

Use the two-argument form when the parent schema needs local parsing before materializing the kit:

```ts
const emailField = zodFromKit(z.string().trim().toLowerCase().pipe(z.email()), Email);
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
