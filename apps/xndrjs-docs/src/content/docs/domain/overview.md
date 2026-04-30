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

### Immutability by Default

```
data does not change, it evolves
```

All values are:

- readonly
- immutable
- replaced, not mutated

This removes an entire class of bugs related to implicit state changes. It also make it easier to work with modern FE frameworks, often based on referential equality to ensure the reactivity of the View.

But it's important to point out that this isn't about contaminating the Core of our architecture with infrastructural details (_...like writing business logics with the API of a "UI Library"_): it's just a model that works well with such infrastructural needs, causing no unnecessary friction (i.e. without requiring lots of mappers and DTOs).

---

### Summary

- validators validate structure
- shapes establish trusted representations
- proofs establish semantic guarantees
- capabilities evolve data
- pipelines compose behavior

---

## Public entry points

```typescript
import { domain, compose, pipe, DomainValidationError } from "@xndrjs/domain";
```

- `domain`: `primitive`, `shape`, `proof`, `capabilities`
- `compose`: low-level validator composition helpers
- `pipe`: typed unary composition
- `DomainValidationError`: thrown by `create`/`assert` paths when validation fails
