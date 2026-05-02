---
title: Choose an adapter
description: Pick the right validation adapter for each boundary.
---

Adapters let your domain model depend on one contract while each boundary keeps using the validation engine that fits it best.

## Decision table

| Situation                                 | Recommended package      | Why                                                                      |
| ----------------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| You already use Zod in app or shared code | `@xndrjs/domain-zod`     | Great parser ergonomics, transforms, and kit reuse inside parent schemas |
| You prefer small function-first schemas   | `@xndrjs/domain-valibot` | Good fit for composable parser pipelines and bundle-sensitive code       |
| You consume JSON Schema or OpenAPI        | `@xndrjs/domain-ajv`     | Compiles existing external contracts instead of rewriting them           |
| Validation is very small or custom        | `@xndrjs/domain`         | Use `compose` helpers or your own `Validator` implementation             |

## The adapter does not own the domain

`domain.primitive` and `domain.shape` always take a `Validator`; **how** you build that `Validator` (Zod, JSON Schema + Ajv, Valibot, …) is a boundary concern only. The adapter supplies the helper; the kit is the same kind of object everywhere.

Minimal example: **`Email`** comes from a **JSON Schema** fragment (as in an OpenAPI bundle), while **`UserProfile`** is defined with **Zod**. The contact field reuses the `Email` primitive inside the Zod object so you do not duplicate email rules.

```ts
import { domain, jsonSchemaToValidator } from "@xndrjs/domain-ajv";
import { zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = domain.primitive(
  "Email",
  jsonSchemaToValidator<string>({
    type: "string",
    format: "email",
  })
);

const UserProfile = domain.shape(
  "UserProfile",
  zodToValidator(
    z.object({
      displayName: z.string().min(1),
      contact: zodFromKit(Email),
    })
  )
);
```

`jsonSchemaToValidator` and `zodToValidator` are what differ between the two boundaries; after validation, `Email.create` / `UserProfile.create` and the rest of the `domain` APIs behave the same.

## Mixing adapters

It is valid for different boundaries to use different engines:

- backend OpenAPI contracts can use AJV
- client features (i.e. a document editor) can use Valibot or Zod

The important part is that each boundary returns a `Validator<Input, Output>`. After that, your model uses the same `domain.primitive`, `domain.shape`, `domain.capabilities`, and `domain.proof` APIs.

## Practical recommendation

Start with the adapter your project already uses. Reach for another adapter only when a boundary naturally speaks a different schema language.
