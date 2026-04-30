---
title: Installation
description: Install the xndrjs packages you need.
---

Install only the packages required by the boundary you are modeling.

If you use an adapter package, it already depends on `@xndrjs/domain` and re-exports the domain APIs for convenient single-entry imports.

## Domain core

Use the core package when you want to provide your own validators or use the built-in `compose` helpers.

```bash
pnpm add @xndrjs/domain
```

```ts
import { compose, domain, pipe } from "@xndrjs/domain";
```

## Zod

Use this when your project already uses Zod or you want parser-style transforms at the boundary.

```bash
pnpm add @xndrjs/domain-zod zod
```

```ts
import { domain, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
```

## Valibot

Use this when your project prefers Valibot's function-first schema style.

```bash
pnpm add @xndrjs/domain-valibot valibot
```

```ts
import { domain, valibotFromKit, valibotToValidator } from "@xndrjs/domain-valibot";
```

## AJV, JSON Schema, and OpenAPI

Use this when contracts already exist as JSON Schema or OpenAPI components.

```bash
pnpm add @xndrjs/domain-ajv ajv ajv-formats
```

```ts
import { domain, jsonSchemaToValidator, openApiComponentToValidator } from "@xndrjs/domain-ajv";
```

## Application packages

These packages are optional and solve problems outside the domain modeling core:

```bash
pnpm add @xndrjs/orchestration
pnpm add @xndrjs/react-adapter react
pnpm add @xndrjs/data-layer dataloader
pnpm add @xndrjs/tasks
```

See [Ports, data, tasks](/application/toolkit/) for their role in the broader toolkit.

## Runtime and TypeScript

All public packages are TypeScript-first and include type definitions. Packages target Node.js 18+.

For new domain work, use `@xndrjs/domain` plus one adapter.
