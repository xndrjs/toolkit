# xndrjs Toolkit

This repo is a **pnpm workspace** for **xndrjs**: Clean Architecture libraries for fullstack TypeScript.

- **`packages/<name>`** — libraries meant to be **published to npm** (scoped `@xndrjs/*`).
- **`apps/<name>`** — **not published** as libraries; things like the **documentation site** (`xndrjs-documentation`), **examples** (`interop-demo`, `oas-core-validator-demo`), and **internal tooling** (`domain-bench`, `resource-graph-resolver-bench`). They are in Changesets `ignore` and marked `"private": true` so they never ship on stable or alpha.

Workspace-wide scripts (install, build, test, release) run from the **repository root**; each package documents its own API in its `README.md` or in the docs app.

**Domain modeling:** use **`@xndrjs/domain`** (validator-agnostic) and schema adapters such as **`@xndrjs/domain-zod`** (Zod 4) and **`@xndrjs/domain-valibot`**. More validation adapters are **on the roadmap** (several likely in the near term).

## Requirements

- Node **`>=24 <26`** (see `engines` in `package.json`)
- [pnpm](https://pnpm.io) **9.15** (matches `packageManager`)

## Useful commands

| Command               | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `pnpm install`        | Install dependencies for the whole workspace                     |
| `pnpm build:packages` | Run `build` in each `packages/*` package that defines the script |
| `pnpm test`           | Run tests for all packages                                       |
| `pnpm changeset`      | Create or update a release note (files under `.changeset/`)      |

## Packages

| Package                           | Description                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@xndrjs/domain`                  | Validator-agnostic shapes, primitives, proofs, capabilities (`packages/domain`)                               |
| `@xndrjs/domain-zod`              | Zod 4 adapter; re-exports domain (`packages/domain-zod`)                                                      |
| `@xndrjs/domain-valibot`          | Valibot adapter; re-exports domain (`packages/domain-valibot`)                                                |
| `@xndrjs/tasks`                   | Lazy async tasks with retry (`packages/tasks`)                                                                |
| `@xndrjs/orchestration`           | Orchestration ports (`packages/orchestration`)                                                                |
| `@xndrjs/react-adapter`           | React hooks for orchestration ports (`packages/react-adapter`)                                                |
| `@xndrjs/addressable-resources`   | Addressable resource identifiers; succeeds `@xndrjs/application-resources` (`packages/addressable-resources`) |
| `@xndrjs/resource-graph-resolver` | Resource graph resolver, islands, expansion (`packages/resource-graph-resolver`)                              |
| `@xndrjs/ziel`                    | Ziel product entry: DSL compile + resolve façades over the resource graph resolver (`packages/ziel`)          |
| `@xndrjs/contentful-to-zod`       | Zod 4 codegen from Contentful content types (`packages/contentful-to-zod`)                                    |
