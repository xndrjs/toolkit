---
title: Installation
description: Install xndrjs domain packages and validation adapters
order: 3
seeAlso: |
  After installation, build your [First model](./first-model.md) and then move to the [Domain overview](/docs/domain/overview).
---

# Installation

Install only the packages you need for your validation stack. If you use an adapter
package, it already depends on `@xndrjs/domain` and re-exports its public APIs for
convenience.

## Base package

```bash
pnpm add @xndrjs/domain
```

## Adapter packages

Choose one adapter according to the engine you use.

### Zod 4

```bash
pnpm add @xndrjs/domain-zod zod
```

### AJV (JSON Schema / OpenAPI)

```bash
pnpm add @xndrjs/domain-ajv ajv ajv-formats
```

### Valibot

```bash
pnpm add @xndrjs/domain-valibot valibot
```

## Recommended setup examples

### domain + zod

```bash
pnpm add @xndrjs/domain-zod zod
```

```typescript
import { domain, zodToValidator } from "@xndrjs/domain-zod";
```

### domain + ajv

```bash
pnpm add @xndrjs/domain-ajv ajv ajv-formats
```

```typescript
import { domain, jsonSchemaToValidator } from "@xndrjs/domain-ajv";
```

### domain + valibot

```bash
pnpm add @xndrjs/domain-valibot valibot
```

```typescript
import { domain, valibotToValidator } from "@xndrjs/domain-valibot";
```

## TypeScript

All `xndrjs` packages are TypeScript-first and include type definitions.

## Peer Dependencies

- `@xndrjs/domain-zod` -> `zod@^4`
- `@xndrjs/domain-valibot` -> `valibot` (matching the adapter major)
- `@xndrjs/domain-ajv` -> `ajv` runtime expected by your app

## Benchmarks package

`@xndrjs/bench-perf` is a **private monorepo package** used for internal comparisons.
