---
title: Introduction
description: What xndrjs is, what it is not, and how its packages fit together.
---

`xndrjs` is a TypeScript toolkit for building fullstack applications with explicit boundaries, composable semantics, and predictable data flow.

It is inspired by Clean Architecture and Domain-Driven Design, but it deliberately avoids turning those ideas into a heavy framework. The toolkit focuses on small, ergonomic libraries that make good architectural habits easier to apply under normal delivery pressure.

## Why the name

The name `xndrjs` comes from `xndr`, a compact abbreviation of "Alexander": a reference to Alexander the Great and the legend of the Gordian knot.

Faced with an intricate knot, Alexander did not patiently untangle every loop. He cut through it. That image fits the project: `xndrjs` tries to give TypeScript systems a clean cut through complexity by separating layers clearly, making boundaries explicit, and choosing radical, original solutions where more usual conventions tend to keep the knot in place.

## Not a framework

`xndrjs` is not a framework.

It does not:

- define your application structure
- control your runtime
- impose lifecycle hooks or conventions
- require you to “buy into” a specific way of building apps

Instead, it is a **toolkit of architectural primitives** organized by the problem each package solves. Packages help you:

- keep business meaning independent of UI frameworks and IO details
- make trust boundaries explicit when data crosses processes, networks, forms, caches, or queues
- share application-level contracts without leaking infrastructure
- plug delivery concerns (async work, i18n, CMS codegen) in at the edge

The main design goal is:

> Make robust architecture the path of least resistance.

## Why it exists

### Structuring responsibility

A recurring challenge in application design is not _what_ to build, but _where_ to put it.

As systems grow, responsibilities tend to blur:

- validation and business rules leak into UI code
- use-case meaning gets mixed with cache keys, HTTP clients, and CMS details
- transformations happen “where convenient” rather than where they belong

Without clear boundaries, the codebase becomes harder to navigate and reason about.

`xndrjs` exists to make responsibility **explicit and predictable** — not by imposing a rigid folder layout, but by giving each concern a natural home and small APIs that fit that home.

### Making good habits the easy path

Many practices are universally accepted as “good”:

- validate external input at boundaries
- keep business rules out of delivery mechanisms
- name shared application concepts once
- handle transient failures consistently

They are also easy to apply inconsistently. `xndrjs` turns selected habits into ergonomic primitives so the correct approach is the one that feels natural under delivery pressure.

### Organized by capability

Modern TypeScript apps span frontend, backend, server actions, edge runtimes, workers, and shared packages. Frameworks are useful entry points. They should not own your core meaning.

Docs and packages are grouped by capability — the same map as the [homepage](/):

- **Modeling** — domain models, invariants, and schema-backed guarantees
- **Resource Orchestration** — addressable resources, graph resolution, and declarative orchestration
- **Localization** — type-safe i18n and framework integrations
- **Integrations** — bridges between external systems and xndrjs
- **Concurrency / Workflows** — task composition and controlled concurrent execution

That split keeps modeling separate from orchestration, localization, integrations, and concurrency so you can adopt one responsibility at a time.

## Package groups

**Modeling**

- `@xndrjs/domain`: validator-agnostic domain modeling core.
- `@xndrjs/domain-zod`: Zod adapter plus domain re-exports.
- `@xndrjs/domain-valibot`: Valibot adapter plus domain re-exports.
- `@xndrjs/domain-ajv`: AJV adapter for JSON Schema and OpenAPI component schemas.

**Resource Orchestration**

- `@xndrjs/addressable-resources`: addressable resource identifiers shared across use cases and adapters, without cache or UI coupling.
- `@xndrjs/resource-graph-resolver`: typed resource graph resolution across multiple data sources.
- `@xndrjs/ziel`: declarative resource orchestration language and toolchain.

**Localization**

- `@xndrjs/i18n`: type-safe ICU i18n with codegen, namespaces, and lazy loading.
- `@xndrjs/i18n-react`: React root and namespace gates for translation readiness.

**Integrations**

- `@xndrjs/contentful-to-zod`: Contentful CMA to Zod 4 codegen.

**Concurrency / Workflows**

- `@xndrjs/tasks`: lazy async task helpers with retry support and inflight Promise deduplication.

Modeling is often where teams start, because it is where meaning concentrates. The other groups extend the same boundary-first approach outward. Install each package from its own guide — there is no single toolkit install.

## The short version

Use `xndrjs` when you want:

- Clean Architecture habits without a heavy framework
- fullstack TypeScript with explicit boundaries
- small libraries you can adopt one responsibility at a time
- adapters and delivery tools that stay replaceable at the edge

Next: explore the [homepage map](/), then open a section that matches your need — [Modeling overview](/v0/modeling/overview/), [Addressable resources](/v0/resource-orchestration/addressable-resources/), [i18n](/v0/localization/i18n/), or [Tasks](/v0/concurrency/tasks/).
