---
title: Overview
description: @xndrjs/domain-zod adapter overview
order: 1
seeAlso: |
  - [API](./api.md)
  - [Domain overview](/docs/domain/overview)
---

# Zod adapter overview

`@xndrjs/domain-zod` integrates Zod 4 with `@xndrjs/domain`.

It provides:

- `zodToValidator(schema)` to convert Zod schemas into domain validators
- `zodFromKit(...)` helpers to embed domain kits inside Zod schemas
- full re-export of `@xndrjs/domain` for single-entry imports

## Install

```bash
pnpm add @xndrjs/domain-zod zod
```

## When to use

- you already use Zod as main schema layer
- you want domain kits with Zod parsing semantics
- you need bidirectional kit/schema interop
