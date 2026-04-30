---
title: Introduction
description: Introduction to xndr framework-agnostic state management
order: 1
---

# Introduction

`xndr` is a collection of libraries that let you write framework-agnostic state management. This means you will be able to write your business logics once, and share it between different frameworks (React, Solid, Svelte - more incoming) or between client-side and server-side (i.e. in Next.js).

## Why xndr?

The name `xndr` (pronounced "xander") comes from **Alexander** the Great, who famously cut the Gordian knot: a symbol of cutting through complexity with a radical solution.

Just as Alexander cut through the knot, `xndr` helps you make a clean cut between UI-specific state (i.e. `isOpen` for a modal) and domain entity state management (which should be framework-agnostic and reusable), wherever needed. This separation ensures that your business logic remains independent of any frontend framework, making it truly reusable across different projects and teams.

## Core Philosophy

`xndr`'s mission is to let you

- Write business logic **once** using framework-agnostic patterns
- Reuse the same code with React, Solid, Svelte (support for more frameworks incoming)
- Build complex state management with proven patterns (CQRS, FSM, Memento)
- Maintain clear separation between business logic and UI layer

## Packages

### Core Library

- **@xndrjs/core** - StatePort pattern, reactive values, lifecycle management

### Patterns

- **@xndrjs/cqrs** - Command Query Responsibility Segregation (CommandBus, QueryBus, EventBus)
- **@xndrjs/fsm** - Finite State Machine implementation
- **@xndrjs/memento** - Undo/Redo pattern implementation

### Framework Adapters

- **@xndrjs/adapter-react** - React integration
- **@xndrjs/adapter-solid** - Solid.js integration
- **@xndrjs/adapter-svelte** - Svelte integration

### Developer Tools

- **@xndrjs/devtools-react** - DevTools for debugging and monitoring reactive applications

## Key Concepts

### StatePort Pattern

The `StatePort` interface provides a framework-agnostic way to work with reactive state. It defines three methods:

- `get()` - get the current value
- `set(value)` - set a new value
- `subscribe(callback)` - subscribe to value changes

This simple interface allows your business logic to work with the reactivity systems of many different frameworks through adapters.

### Framework Agnosticism

`xndr` packages are written in pure TypeScript with no framework dependencies. Your business logics can be:

- tested in isolation (no framework mocking needed)
- reused across multiple frameworks in the same project
- shared between different teams using different frameworks
- migrated from one framework to another without rewriting business logic

## Getting Started

Ready to start? Check out the [Installation Guide](./installation.md) to install `xndr` packages, or dive into [Core Concepts](./concepts.md) to understand the fundamental patterns.
