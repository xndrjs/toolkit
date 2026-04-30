---
title: API
description: zodToValidator and zodFromKit reference
order: 2
seeAlso: |
  - [Overview](./overview.md)
---

# Zod adapter API

## `zodToValidator(schema)`

Wraps a Zod 4 schema as `Validator<Input, Output>`.

```typescript
import { z } from "zod";
import { domain, zodToValidator } from "@xndrjs/domain-zod";

const userValidator = zodToValidator(
  z.object({ id: z.string(), age: z.number().int().nonnegative() })
);

const User = domain.shape("User", userValidator);
```

Failure mapping:

- `engine: "zod"`
- one domain issue per Zod issue
- raw issue payload available in issue metadata

## `zodFromKit(...)`

Converts a domain kit into a Zod field.

```typescript
zodFromKit(kit);
zodFromKit(schema, kit);
```

- `zodFromKit(kit)`: validates through `kit.validator.validate`
- `zodFromKit(schema, kit)`: parses with explicit schema, then materializes via `kit.create`

Supports both primitive and shape kits.

```typescript
import { domain, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = domain.primitive("Email", zodToValidator(z.email()));

const Invite = domain.shape(
  "Invite",
  zodToValidator(
    z.object({
      recipient: zodFromKit(Email),
      message: z.string().min(1),
    })
  )
);

const invite = Invite.create({
  recipient: "dev@example.com",
  message: "Welcome",
});
```

Use the two-argument form when the parent schema needs local parsing before materializing
the kit:

```typescript
const emailField = zodFromKit(z.string().trim().toLowerCase().pipe(z.email()), Email);
```
