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
import { zodToValidator } from "@xndrjs/domain-zod";

const userValidator = zodToValidator(
  z.object({ id: z.string(), age: z.number().int().nonnegative() })
);
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
