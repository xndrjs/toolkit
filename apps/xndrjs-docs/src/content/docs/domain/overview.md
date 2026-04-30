---
title: Overview
description: Philosophy and package boundaries for @xndrjs/domain
order: 1
seeAlso: |
  - [Validator and errors](./validator-and-errors.md)
  - [Primitive and shape](./primitive-shape-proof.md)
  - [Proof](./proof.md)
---

# Domain overview

`@xndrjs/domain` is the runtime modeling core of xndrjs.

It provides:

- a validator contract (`Validator<Input, Output>`)
- modeling kits (`domain.primitive`, `domain.shape`, `domain.proof`)
- composition helpers (`compose.array`, `compose.object`, `compose.optional`)
- capability attachment (`domain.capabilities`)
- typed function composition (`pipe`)

Its job is not to be a schema engine. Its job is to turn validation into a stable domain
boundary that the rest of your application can trust.

## Philosophy

### Semantics Over Structure

```
structure describes shape - semantics describes meaning
```

`xndrjs` clearly separates:

- structural validation (schema)
- semantic guarantees (proofs)
- representation identity (shapes)
- operations on data structures (capabilities)

These concepts are orthogonal and composable in our model.

| Concept    | What it answers                                                |
| ---------- | -------------------------------------------------------------- |
| Validator  | "Does this unknown input match the expected structure?"        |
| Primitive  | "Is this scalar value meaningful in my domain?"                |
| Shape      | "Is this object now a trusted representation?"                 |
| Proof      | "Has this value earned an additional guarantee?"               |
| Capability | "What transitions are allowed, and how are they re-validated?" |

### Immutability by Default

```
data does not change, it evolves
```

All values are:

- readonly
- immutable
- replaced, not mutated

This removes an entire class of bugs related to implicit state changes. It also makes it easier to work with modern FE frameworks, often based on referential equality to update views predictably.

This is not about contaminating the core of your architecture with infrastructural details, such as writing business logic through a UI library API. It is a plain data model that works well with those infrastructural needs without requiring lots of mappers and DTOs.

### Boundary First

```text
input is untrusted until a kit creates or proves it
```

`create`, `safeCreate`, and `assert` are the main trust-boundary operations. They make
the important moment visible in code:

```typescript
const user = User.create(rawInput);
const verified = VerifiedUser.assert(user);
```

After that point, your application can pass the value around as trusted data until it
leaves the boundary again, for example through JSON transport or persistence.

---

### Summary

- validators validate structure
- shapes establish trusted representations
- proofs establish semantic guarantees
- capabilities evolve data
- pipelines compose behavior

## Choosing the right kit

| Need                                                         | Use                   |
| ------------------------------------------------------------ | --------------------- |
| Validate an email, id, slug, currency, or other scalar value | `domain.primitive`    |
| Materialize a trusted object from external input             | `domain.shape`        |
| Express an operation such as rename, verify, cancel, approve | `domain.capabilities` |
| Require a stronger guarantee for a specific workflow         | `domain.proof`        |
| Build small validators without Zod, AJV, or Valibot          | `compose`             |
| Chain transformations or proof assertions left-to-right      | `pipe`                |

---

## Public entry points

```typescript
import { domain, compose, pipe, DomainValidationError } from "@xndrjs/domain";
```

- `domain`: `primitive`, `shape`, `proof`, `capabilities`
- `compose`: low-level validator composition helpers
- `pipe`: typed unary composition
- `DomainValidationError`: thrown by `create`/`assert` paths when validation fails
