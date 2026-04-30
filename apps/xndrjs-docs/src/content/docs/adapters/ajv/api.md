---
title: API
description: jsonSchemaToValidator and openApiComponentToValidator reference
order: 2
seeAlso: |
  - [Overview](./overview.md)
---

# AJV adapter API

## `createAjvDomainAdapter(options?)`

Builds an adapter instance and returns:

- `jsonSchemaToValidator(schema)`
- `openApiComponentToValidator(bundle, componentName)`

Use this when you need a custom AJV instance.

## `jsonSchemaToValidator(schema)`

Compiles a JSON Schema into a domain validator.

```typescript
import { domain, jsonSchemaToValidator } from "@xndrjs/domain-ajv";

const userValidator = jsonSchemaToValidator<{ id: string }>({
  type: "object",
  properties: { id: { type: "string" } },
  required: ["id"],
  additionalProperties: false,
});

const User = domain.shape("User", userValidator);
```

## `openApiComponentToValidator(bundle, componentName)`

Resolves and compiles `#/components/schemas/<componentName>` from an OpenAPI bundle.

```typescript
import { openApiComponentToValidator } from "@xndrjs/domain-ajv";

const userValidator = openApiComponentToValidator<MyUser>(bundle, "User");
const User = domain.shape("User", userValidator);
```

Failure mapping:

- `engine: "ajv"`
- path derived from `instancePath`
- required-property errors append the missing field to path
