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

The same model can be written with different adapters:

```ts
const Email = domain.primitive("Email", emailValidator);
const User = domain.shape("User", userValidator);
```

The adapter decides how `emailValidator` and `userValidator` are built. The domain kit decides what those values mean after validation.

## Mixing adapters

It is valid for different boundaries to use different engines:

- frontend form schemas can use Zod
- backend OpenAPI contracts can use AJV
- edge or client bundles can use Valibot

The important part is that each boundary returns a `Validator<Input, Output>`. After that, your model uses the same `domain.primitive`, `domain.shape`, `domain.capabilities`, and `domain.proof` APIs.

## Practical recommendation

Start with the adapter your project already uses. Reach for another adapter only when a boundary naturally speaks a different schema language.
