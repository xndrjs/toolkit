---
title: Package map
description: The role, dependencies, and recommended use of each xndrjs package.
---

Use this page when deciding which package belongs in which layer.

| Package                  | Role                                              | Install when                                                            |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------- |
| `@xndrjs/domain`         | Validator-agnostic domain core                    | You want primitives, shapes, proofs, capabilities, `compose`, or `pipe` |
| `@xndrjs/domain-zod`     | Zod 4 adapter                                     | Your boundary already uses Zod or needs Zod transforms                  |
| `@xndrjs/domain-valibot` | Valibot adapter                                   | You prefer Valibot schemas or small function-first validators           |
| `@xndrjs/domain-ajv`     | AJV adapter                                       | Your contracts are JSON Schema or OpenAPI                               |
| `@xndrjs/orchestration`  | Application and presentation ports                | Use cases need to talk to UI/application boundaries through interfaces  |
| `@xndrjs/react-adapter`  | React implementations of orchestration ports      | React components need port-backed state hooks                           |
| `@xndrjs/data-layer`     | DataLoader registry and batch alignment utilities | You batch load data and need stable request-scoped loaders              |
| `@xndrjs/tasks`          | Lazy async tasks with retry                       | You want composable async effects in infrastructure code                |
| `@xndrjs/bench-perf`     | Private benchmark suite                           | Internal monorepo performance comparisons                               |

## Recommended imports

If you use an adapter, import domain APIs from the adapter package:

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
```

If you do not use an adapter, import from the core:

```ts
import { compose, domain, pipe } from "@xndrjs/domain";
```

## Dependency notes

- `@xndrjs/domain-zod` expects Zod 4.
- `@xndrjs/domain-valibot` expects Valibot matching the adapter major.
- `@xndrjs/domain-ajv` expects AJV and `ajv-formats`.
- `@xndrjs/data-layer` expects `dataloader` as a peer dependency.
- `@xndrjs/react-adapter` expects React 18.3 or 19.

## Layering guideline

Keep the direction of dependency clear:

```text
UI and adapters
  -> orchestration
  -> domain
  -> data layer / infrastructure
```

The domain model should not know about React, DataLoader, HTTP, or storage. It should know how to validate, name, evolve, and prove its own values.
