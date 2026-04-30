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
import { domain, valibotToValidator } from "@xndrjs/domain-valibot";

const emailValidator = valibotToValidator(v.pipe(v.string(), v.email()));
const Email = domain.primitive("Email", emailValidator);
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

```typescript
import * as v from "valibot";
import { domain, valibotFromKit, valibotToValidator } from "@xndrjs/domain-valibot";

const Email = domain.primitive("Email", valibotToValidator(v.pipe(v.string(), v.email())));

const Contact = domain.shape(
  "Contact",
  valibotToValidator(
    v.object({
      email: valibotFromKit(Email),
      name: v.pipe(v.string(), v.minLength(1)),
    })
  )
);
```
