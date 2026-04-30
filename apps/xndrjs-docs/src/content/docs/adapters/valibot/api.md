---
title: API
description: valibotToValidator and valibotFromKit reference
order: 2
seeAlso: |
  - [Overview](./overview.md)
---

# Valibot adapter API

## `valibotToValidator(schema)`

Wraps a Valibot schema into `Validator<Input, Output>`.

```typescript
import * as v from "valibot";
import { valibotToValidator } from "@xndrjs/domain-valibot";

const emailValidator = valibotToValidator(v.pipe(v.string(), v.email()));
```

## `valibotFromKit(kit)`

Creates a Valibot-compatible field schema from a domain kit.

```typescript
import { valibotFromKit } from "@xndrjs/domain-valibot";

const emailField = valibotFromKit(EmailKit);
```

Works with:

- primitive kits
- shape kits
