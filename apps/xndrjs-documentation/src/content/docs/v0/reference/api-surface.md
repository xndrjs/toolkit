---
title: API surface
description: Compact reference for the main xndrjs APIs.
---

This page is a compact map of the APIs you will use most often.

## @xndrjs/domain

```ts
import { DomainValidationError, compose, domain, pipe } from "@xndrjs/domain";
```

### domain

```ts
domain.primitive(type, validator);
domain.shape(type, validator);
domain.proof(brand, validator);
domain.capabilities<Req>().methods(factory).attach(shapeKit);
```

### compose

```ts
compose.optional(validator);
compose.object(fields);
compose.array(validator);
```

### pipe

```ts
pipe(value, fn1, fn2, fn3);
```

### Errors and types

Common exported types include:

- `Validator<Input, Output>`
- `ValidationResult<T>`
- `ValidationFailure`
- `ValidationIssue`
- `PrimitiveKit`
- `ShapeKit`
- `ProofKit`
- `ProofValue`
- `Brand`
- `Branded`

`DomainValidationError` is thrown by creation and assertion APIs on validation failure.

## @xndrjs/domain-zod

```ts
import { domain, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
```

- `zodToValidator(schema)`: wraps a Zod 4 schema as a domain validator.
- `zodFromKit(kit)`: validates through a primitive or shape kit.
- `zodFromKit(schema, kit)`: parses locally, then materializes through the kit.

## @xndrjs/domain-valibot

```ts
import { domain, valibotFromKit, valibotToValidator } from "@xndrjs/domain-valibot";
```

- `valibotToValidator(schema)`: wraps a Valibot schema as a domain validator.
- `valibotFromKit(kit)`: uses a primitive or shape kit as a Valibot field.

## @xndrjs/domain-ajv

```ts
import {
  createAjvDomainAdapter,
  domain,
  jsonSchemaToValidator,
  openApiComponentToValidator,
} from "@xndrjs/domain-ajv";
```

- `jsonSchemaToValidator(schema)`: compiles JSON Schema into a domain validator.
- `openApiComponentToValidator(bundle, componentName)`: compiles an OpenAPI component schema.
- `createAjvDomainAdapter(options?)`: creates an adapter with custom AJV options.

## @xndrjs/tasks

```ts
import { sleep, task } from "@xndrjs/tasks";
```

Use this package in the infrastructure layer to keep async effects explicit.
