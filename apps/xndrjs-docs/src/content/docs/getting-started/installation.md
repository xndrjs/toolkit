---
title: getting-started → Installation
seeAlso: |
  After installation, check out the [Core Concepts](./concepts.md) guide to understand how to use `xndr` in your application.
---

# Installation

Install `xndr` packages using your preferred package manager.

## Package Manager

### npm

```bash
npm install @xndrjs/core
npm install @xndrjs/adapter-react  # For React
npm install @xndrjs/adapter-solid  # For Solid
npm install @xndrjs/adapter-svelte # For Svelte
```

### pnpm

```bash
pnpm add @xndrjs/core
pnpm add @xndrjs/adapter-react  # For React
pnpm add @xndrjs/adapter-solid  # For Solid
pnpm add @xndrjs/adapter-svelte # For Svelte
```

### yarn

```bash
yarn add @xndrjs/core
yarn add @xndrjs/adapter-react  # For React
yarn add @xndrjs/adapter-solid  # For Solid
yarn add @xndrjs/adapter-svelte # For Svelte
```

## Installing Pattern Packages

If you need CQRS, FSM, or Memento patterns:

```bash
# CQRS Pattern
pnpm add @xndrjs/cqrs

# Finite State Machine
pnpm add @xndrjs/fsm

# Memento Pattern (Undo/Redo)
pnpm add @xndrjs/memento
```

## Installing DevTools

For React applications, install the DevTools package:

```bash
pnpm add @xndrjs/devtools-react
```

## TypeScript

All `xndr` packages are written in TypeScript and include type definitions. No additional type packages are needed.

## Peer Dependencies

### @xndrjs/core

- `fast-deep-equal` ^3.1.3
- `immer` ^10.0.0

### Framework Adapters

- **@xndrjs/adapter-react**: Requires `react` >= 18.0.0
- **@xndrjs/adapter-solid**: Requires `solid-js` >= 1.8.0
- **@xndrjs/adapter-svelte**: Requires `svelte` >= 5.0.0
