---
title: Package map
description: The role, dependencies, and recommended use of each xndrjs package.
---

Use this page when deciding which package belongs in which layer.

| Package                                                              | Role                                      | Install when                                                                                            |
| -------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `@xndrjs/domain`                                                     | Validator-agnostic domain core            | You want primitives, shapes, proofs, `capabilities.forShape` / `forPrimitive`, `compose`, or `pipe`     |
| `@xndrjs/domain-zod`                                                 | Zod 4 adapter                             | Your boundary already uses Zod or needs Zod transforms                                                  |
| `@xndrjs/domain-valibot`                                             | Valibot adapter                           | You prefer Valibot schemas or small function-first validators                                           |
| `@xndrjs/domain-ajv`                                                 | AJV adapter                               | Your contracts are JSON Schema or OpenAPI                                                               |
| [`@xndrjs/contentful-to-zod`](/v0/infrastructure/contentful-to-zod/) | Contentful CMA to Zod 4 codegen           | You want typed field schemas from Contentful content types (flat CMA and/or delivery locale records)    |
| [`@xndrjs/i18n`](/v0/infrastructure/i18n/)                           | Type-safe ICU i18n with runtime override  | You want codegen-typed translation keys, ICU pluralization, CMS hydration, and optional lazy namespaces |
| `@xndrjs/tasks`                                                      | Lazy async tasks with retry               | You want composable async effects in infrastructure code                                                |
| `@xndrjs/bench-perf`                                                 | Private benchmark CLI (`apps/bench-perf`) | Internal monorepo performance comparisons                                                               |

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
- `@xndrjs/contentful-to-zod` expects Zod 4 and a Contentful Management API token for live fetch (or JSON snapshots for offline codegen). Pair with `@xndrjs/domain-zod` when modeling generated schemas as domain kits. See [Contentful to Zod](/v0/infrastructure/contentful-to-zod/).
