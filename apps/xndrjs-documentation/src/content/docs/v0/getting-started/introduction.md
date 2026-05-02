---
title: Introduction
description: What xndrjs is, what it is not, and how its packages fit together.
---

`xndrjs` is a TypeScript toolkit for building Domain-Driven applications with explicit boundaries, composable semantics, and predictable data flow.

It is inspired by Clean Architecture and Domain-Driven Design, but it deliberately avoids turning those ideas into a heavy framework. The toolkit focuses on small, ergonomic libraries that make good architectural habits easier to apply under normal delivery pressure.

## Not a framework

`xndrjs` is not a framework.

It does not:

- define your application structure
- control your runtime
- impose lifecycle hooks or conventions
- require you to “buy into” a specific way of building apps

Instead, it is a **toolkit of architectural primitives**. It provides clear building blocks for:

- validating unknown data at explicit boundaries
- giving meaningful domain names to values
- keeping representations immutable
- expressing allowed state transitions as functions
- proving stronger semantic guarantees when a workflow needs them
- connecting domain code to orchestration, UI, data loading, and async effects
- segregating domain logic from the View layer

The main design goal is:

> Make robust architecture the path of least resistance.

## Why it exists

### Structuring Responsibility

A recurring challenge in application design is not _what_ to build, but _where_ to put it.

As systems grow, responsibilities tend to blur:

- validation logic leaks into UI code
- business rules get mixed with data fetching
- transformations happen “where convenient” rather than where they belong

Without clear boundaries, the codebase becomes harder to navigate and reason about.

`xndrjs` exists to make responsibility **explicit and predictable**.

Instead of relying on conventions or discipline alone, it encourages a structure where:

- domain modeling happens in one place
- behavior is clearly separated from data
- transformations follow explicit pipelines
- each concept has a natural “home”

The goal is not to impose a rigid architecture, but to make the correct placement of logic obvious by design.

### Enforcing Best Practices

Many practices in modern applications are universally accepted as “good”:

- validating external input
- enforcing invariants
- normalizing data at boundaries

However, these practices are often applied inconsistently.

In most codebases:

- validation is sometimes forgotten
- checks are duplicated or slightly different across modules
- custom logic replaces standard patterns
- implicit assumptions create hidden gaps

Over time, this leads to uncertainty:

- is this value really safe to use?
- has this input been validated already?
- are we missing edge cases somewhere?

`xndrjs` exists to turn these best practices into guarantees.

By providing highly ergonomic primitives

- validation becomes part of creation, not an extra step
- trusted values are clearly distinguished from untrusted ones
- semantic guarantees are explicit and composable
- unsafe paths are harder to express than safe ones

Instead of relying on discipline, the system makes the correct approach:

> the easiest one to follow

The result is a codebase where correctness is not something to remember, but something that emerges naturally from how the system is designed.

### Formalizing _Trust_

Modern TypeScript applications often run across frontend, backend, server actions, edge runtimes, workers, and shared packages. Types move easily across those layers, but _trust_ does not.

A value that was type-safe inside a module becomes ordinary JSON when it crosses a network, form, cache, queue, storage, or process boundary. `xndrjs` makes those moments explicit:

```ts
const user = User.create(rawInput);
const verified = VerifiedUser.assert(user);
```

The code tells you when data becomes trusted and when it earns a stronger guarantee, while keeping _trust policies_ in one place.

## Package groups

The toolkit is organized around a few responsibilities:

- `@xndrjs/domain`: validator-agnostic domain modeling core.
- `@xndrjs/domain-zod`: Zod adapter plus domain re-exports.
- `@xndrjs/domain-valibot`: Valibot adapter plus domain re-exports.
- `@xndrjs/domain-ajv`: AJV adapter for JSON Schema and OpenAPI component schemas.
- `@xndrjs/orchestration`: application ports for use-case and presentation boundaries.
- `@xndrjs/react-adapter`: React hooks that implement orchestration ports.
- `@xndrjs/data-layer`: DataLoader registry and batch result mapping utilities.
- `@xndrjs/tasks`: lazy async task helpers with retry support.

Start with the domain packages. They are the mental center of the toolkit.

## The short version

Use `xndrjs` when you want:

- plain anemic data, not class-heavy models
- behavior as named functions on domain kits
- runtime validation and TypeScript guarantees working together
- explicit trust boundaries instead of scattered validation
- adapters that let your schema engine remain an implementation detail

Next: [Mental model](/v0/getting-started/mental-model/).
