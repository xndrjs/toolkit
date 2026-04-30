---
title: Overview
description: Philosophy and package boundaries for @xndrjs/domain.
---

# Domain overview

`@xndrjs/domain` is the runtime modeling core of xndrjs.

It provides:

- a validator contract: `Validator<Input, Output>`
- modeling kits: `domain.primitive`, `domain.shape`, `domain.proof`
- behavior attachment: `domain.capabilities`
- lightweight validator composition: `compose.array`, `compose.object`, `compose.optional`
- typed function composition: `pipe`

Its job is not to be a schema engine. Its job is to turn validation into a stable domain boundary that the rest of your application can trust.

## Semantics over structure

```text
structure describes shape
semantics describes meaning
```

`xndrjs` separates:

- structural validation
- representation identity
- semantic guarantees
- allowed operations

| Concept    | What it answers                                          |
| ---------- | -------------------------------------------------------- |
| Validator  | Does this unknown input match the expected structure?    |
| Primitive  | Is this scalar value meaningful in my domain?            |
| Shape      | Is this object now a trusted representation?             |
| Capability | What transitions are allowed, and are they re-validated? |
| Proof      | Has this value earned an additional guarantee?           |

These concepts are orthogonal and composable.

## Immutability by default

```text
data does not change, it evolves
```

Domain values are readonly and replaced, not mutated. Capability methods produce new validated values:

```ts
const updated = User.rename(user, "New name");
```

This removes a class of bugs related to implicit state changes and works naturally with UI frameworks, caching layers, and tests that rely on predictable references.

## Boundary first

```text
input is untrusted until a kit creates or proves it
```

The main trust-boundary operations are:

- `create(input)`: validate and throw on failure
- `safeCreate(input)`: validate and return a result union
- `assert(input)`: validate or prove and throw on failure
- `test(input)`: check a proof without throwing

After a value leaves the process or becomes JSON, it should re-enter through a boundary again.

## Choosing the right kit

| Need                                                         | Use                   |
| ------------------------------------------------------------ | --------------------- |
| Validate an email, id, slug, or currency code                | `domain.primitive`    |
| Materialize a trusted object from external input             | `domain.shape`        |
| Express an operation such as rename, verify, cancel, approve | `domain.capabilities` |
| Require a stronger guarantee for a specific workflow         | `domain.proof`        |
| Build small validators without an adapter                    | `compose`             |
| Chain transformations or assertions left-to-right            | `pipe`                |

## Public entry point

```ts
import { DomainValidationError, compose, domain, pipe } from "@xndrjs/domain";
```

Adapter packages re-export this surface for convenience:

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
```
