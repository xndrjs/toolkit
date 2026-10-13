---
title: Choose an adapter
description: Pick the right validation adapter for each domain boundary.
---

Adapters let your domain model depend on one contract while each boundary keeps using the validation engine that fits it best.

## Decision table

| Situation                                 | Recommended package                                        | Why                                                                      |
| ----------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| You already use Zod in app or shared code | [`@xndrjs/domain-zod`](/v0/modeling/adapters/zod/)         | Great parser ergonomics, transforms, and kit reuse inside parent schemas |
| You prefer small function-first schemas   | [`@xndrjs/domain-valibot`](/v0/modeling/adapters/valibot/) | Good fit for composable parser pipelines and bundle-sensitive code       |
| You consume JSON Schema or OpenAPI        | [`@xndrjs/domain-ajv`](/v0/modeling/adapters/ajv/)         | Compiles existing external contracts instead of rewriting them           |
| Validation is very small or custom        | [`@xndrjs/domain`](/v0/modeling/overview/)                 | Use `compose` helpers or your own `Validator` implementation             |

## The adapter does not own the domain

Core `@xndrjs/domain` always takes a `Validator` via `domain.core.*`. Adapter packages (`domain-zod`, `domain-valibot`) export an adapted `domain` whose **top-level** `shape` / `primitive` / `proof` accept native schemas only; use `domain.core.*` with `*ToValidator` when you need an explicit `Validator`. Ajv stays on `jsonSchemaToValidator` / OpenAPI helpers + `domain.core.*` because the input is a JSON Schema document, not a single fluent schema object.

Minimal example: **`Email`** comes from a **JSON Schema** fragment (as in an OpenAPI bundle), while **`UserProfile`** is defined with **Zod**. The contact field reuses the `Email` primitive inside the Zod object so you do not duplicate email rules.

```ts
import { domain as ajvDomain, jsonSchemaToValidator } from "@xndrjs/domain-ajv";
import { domain, zodFromKit } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = ajvDomain.core.primitive(
  "Email",
  jsonSchemaToValidator<string>({
    type: "string",
    format: "email",
  })
);

const UserProfile = domain.shape(
  "UserProfile",
  z.object({
    displayName: z.string().min(1),
    contact: zodFromKit(Email),
  })
);
```

After validation, `Email.create` / `UserProfile.create` and the rest of the kit APIs behave the same regardless of which adapter built the validator.

## Mixing adapters

It is valid for different boundaries to use different engines:

- backend OpenAPI contracts can use AJV
- client features (i.e. a document editor) can use Valibot or Zod

The important part is that each boundary ends up with a `Validator<Input, Output>` under the kit (explicitly or via an adapter `domain` that wraps a native schema). After that, kits use the same APIs: adapter top-level `domain.shape` / `primitive` / `proof` (or `domain.core.*` with a `Validator`), plus `domain.capabilities.*`.

## Practical recommendation

Start with the adapter your project already uses. Reach for another adapter only when a boundary naturally speaks a different schema language.

- [Zod adapter](/v0/modeling/adapters/zod/) — then [First model](/v0/modeling/first-model/) for a full walkthrough
- [Valibot adapter](/v0/modeling/adapters/valibot/)
- [AJV adapter](/v0/modeling/adapters/ajv/)
- [Domain mental model](/v0/modeling/mental-model/) — trust boundaries behind the kits
