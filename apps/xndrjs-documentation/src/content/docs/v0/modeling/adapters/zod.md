---
title: Zod adapter
description: Use Zod schemas with xndrjs domain kits.
---

`@xndrjs/domain-zod` integrates Zod 4 with `@xndrjs/domain`.

It provides:

- an adapted `domain` whose top-level `shape` / `primitive` / `proof` accept Zod schemas; `domain.core.*` still takes a `Validator`
- `zodToValidator(schema)` when you need an explicit `Validator`
- `zodFromKit(kit)` to embed domain kits inside Zod schemas
- full re-export of `@xndrjs/domain` for single-entry imports (this package’s `domain` shadows core)

## Install

```bash
pnpm add @xndrjs/domain-zod zod
```

## Minimal example

```ts
import { domain } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = domain.primitive(
  "Email",
  z.email().transform((value) => value.toLowerCase())
);

const email = Email.create("ADA@EXAMPLE.COM");
// ada@example.com
```

Zod handles parsing and transformation. The domain primitive materializes the trusted value.

## Passing schemas to `domain`

Prefer passing Zod schemas directly:

```ts
const User = domain.shape(
  "User",
  z.object({
    id: z.string(),
    age: z.number().int().nonnegative(),
  })
);
```

Use `zodToValidator` when you need a standalone `Validator` (shared compose, core `@xndrjs/domain`, or documenting the adapter mapping):

```ts
const userValidator = zodToValidator(
  z.object({
    id: z.string(),
    age: z.number().int().nonnegative(),
  })
);

const User = domain.core.shape("User", userValidator);
```

Failure mapping (via the adapter):

- `engine: "zod"`
- one domain issue per Zod issue
- raw issue payload available in metadata

## zodFromKit

`zodFromKit(kit)` turns a primitive or shape kit into a Zod field. Validation and transforms run **only** through the kit’s `validator`; the parent schema does not add a second parsing path for that field.

```ts
const Invite = domain.shape(
  "Invite",
  z.object({
    recipient: zodFromKit(Email),
    message: z.string().min(1),
  })
);
```

## Reusing shapes in parent schemas

```ts
const Address = domain.shape(
  "Address",
  z.object({
    city: z.string().min(1),
    country: z.string().length(2),
  })
);

const User = domain.shape(
  "User",
  z.object({
    id: z.string(),
    address: zodFromKit(Address),
  })
);

const user = User.create({
  id: "user_1",
  address: { city: "Rome", country: "IT" },
});
```

This avoids duplicating nested domain semantics in parent schemas.

## Generated CMS schemas

When you use [`@xndrjs/contentful-to-zod`](/v0/integrations/contentful-to-zod/), parse and flatten at the transport boundary first, then wire the flat field schema into domain:

```ts
import { domain } from "@xndrjs/domain-zod";
import { BlogPostFieldsSchema } from "./generated/contentful.schemas";

export const BlogPost = domain.shape("BlogPost", BlogPostFieldsSchema);
```

Transport schemas describe what can arrive; domain rules define what you trust. See [Contentful to Zod](/v0/integrations/contentful-to-zod/) for the full pipeline.

## Next

Build a complete kit with [First model](/v0/modeling/first-model/), or compare engines in [Choose an adapter](/v0/modeling/choosing-adapter/).
