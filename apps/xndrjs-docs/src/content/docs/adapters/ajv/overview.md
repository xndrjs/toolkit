---
title: Overview
description: "@xndrjs/domain-ajv adapter overview"
order: 1
seeAlso: |
  - [API](./api.md)
  - [Benchmarks](/docs/benchmarks/overview)
---

# AJV adapter overview

`@xndrjs/domain-ajv` connects JSON Schema / OpenAPI schemas to `@xndrjs/domain`.

It is useful when your source of truth is:

- JSON Schema documents
- OpenAPI component schemas
- AJV runtime validation in backend pipelines

## Install

```bash
pnpm add @xndrjs/domain-ajv ajv ajv-formats
```

The adapter exposes both a default instance API and a configurable factory (`createAjvDomainAdapter`).

## Minimal example

```typescript
import { domain, jsonSchemaToValidator } from "@xndrjs/domain-ajv";

const User = domain.shape(
  "User",
  jsonSchemaToValidator<{ id: string; email: string }>({
    type: "object",
    properties: {
      id: { type: "string", minLength: 1 },
      email: { type: "string", format: "email" },
    },
    required: ["id", "email"],
    additionalProperties: false,
  })
);

const user = User.create({ id: "user_1", email: "dev@example.com" });
```

AJV is especially useful when an external contract is already expressed as JSON Schema
or OpenAPI. Unlike parser-oriented libraries such as Zod or Valibot, this adapter mainly
validates the payload and returns it as the declared output type.
