---
title: AJV adapter
description: Use JSON Schema and OpenAPI component schemas as xndrjs domain validators.
---

`@xndrjs/domain-ajv` connects JSON Schema and OpenAPI schemas to `@xndrjs/domain`.

It is useful when your source of truth is:

- JSON Schema documents
- OpenAPI component schemas
- AJV runtime validation in backend pipelines

## Install

```bash
pnpm add @xndrjs/domain-ajv ajv ajv-formats
```

## Minimal example

```ts
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

Unlike parser-oriented libraries such as Zod or Valibot, AJV usually validates a payload against an existing contract and returns it as the declared output type.

## jsonSchemaToValidator

Compile a JSON Schema into a domain validator:

```ts
const userValidator = jsonSchemaToValidator<{ id: string }>({
  type: "object",
  properties: { id: { type: "string" } },
  required: ["id"],
  additionalProperties: false,
});

const User = domain.shape("User", userValidator);
```

## openApiComponentToValidator

Resolve and compile `#/components/schemas/<componentName>` from an OpenAPI bundle:

```ts
import { openApiComponentToValidator } from "@xndrjs/domain-ajv";

const userValidator = openApiComponentToValidator<MyUser>(bundle, "User");
const User = domain.shape("User", userValidator);
```

## Custom AJV instances

Use `createAjvDomainAdapter(options?)` when you need custom AJV behavior:

```ts
import { createAjvDomainAdapter } from "@xndrjs/domain-ajv";

const adapter = createAjvDomainAdapter({
  ajvOptions: { allErrors: true },
});

const validator = adapter.jsonSchemaToValidator<MyUser>(schema);
```

## Failure mapping

AJV failures are normalized into domain issues:

- `engine: "ajv"`
- path derived from `instancePath`
- required-property errors append the missing field to the issue path

## See the example app

You can also check the [example app folder](https://github.com/xndrjs/toolkit/tree/main/apps/oas-core-validator-demo) in `@xndrjs/toolkit`, which shows how an OpenAPI spec is converted to JSON Schema and then passed to the AJV adapter in just a few steps.
