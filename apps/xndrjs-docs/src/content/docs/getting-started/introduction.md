---
title: Introduction
description: Introduction to `xndrjs` domain modeling toolkit
order: 1
---

# Introduction

`xndrjs` is a TypeScript toolkit for building domain-driven applications with explicit boundaries, composable semantics, and predictable data flow.

It is inspired by Clean Architecture and domain-driven design principles, but deliberately avoids rigid or overly academic implementations. Instead, it focuses on pragmatic, ergonomic solutions that keep the entry barrier low while remaining fully extensible as system complexity grows.

## Not Another Framwork

`xndrjs` is not a framework.

It is a set of architectural libraries designed to:

- enforce best practices through constraints, not conventions
- make correct patterns easier to follow than incorrect ones
- provide clear separation between domain, orchestration, and infrastructure

The toolkit is especially tailored for modern fullstack TypeScript environments, where:

- frontend codebases often lag behind backend systems in architectural discipline
- increasing convergence (Next.js, server actions, edge runtimes, etc.) requires stronger consistency across layers
- shared types and contracts demand clearer semantic boundaries

`xndrjs` helps bridge this gap by bringing backend-grade architectural rigor to fullstack TypeScript projects, without sacrificing developer experience.

Its goal is simple:

> make robust architecture the path of least resistance

## Why `xndrjs`?

The word `xndr` (pronounced "xander") comes from **Alexander** the Great, who famously cut the Gordian knot: a symbol of cutting through complexity with a radical solution.

`xndrjs` applies the same spirit to software architecture: cut clean boundaries between layers (domain, orchestration, infrastructure), and keep responsibilities explicit inside each layer.

In domain modeling, this means separating:

- **representations** (data shape and structure)
- **capabilities** (allowed operations and behavior)
- **proofs** (semantic guarantees over validated data)

The goal is not abstraction for its own sake. The goal is practical design that stays easy to use under delivery pressure.

## Core Philosophy

`xndrjs` is built around a simple idea: good architecture should also be ergonomic.

It stems from a very practical need:

> reduce accidental complexity without sacrificing semantic clarity

And it's designed to make code:

- more readable
- more predictable
- safer
- easier to evolve

---

## Packages

- **`@xndrjs/domain`**: core modeling primitives and validation contract
- **`@xndrjs/domain-zod`**: adapter for Zod 4, plus interoperability helpers
- **`@xndrjs/domain-ajv`**: adapter for JSON Schema and OpenAPI components via AJV
- **`@xndrjs/domain-valibot`**: adapter for Valibot schemas
- **`@xndrjs/bench-perf`**: monorepo benchmark suite to compare validation engines on shared scenarios

## Getting Started

Continue with:

- [Installation](./installation.md)
- [Concepts](./concepts.md)
