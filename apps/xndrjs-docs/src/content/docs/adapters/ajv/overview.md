---
title: Overview
description: @xndrjs/domain-ajv adapter overview
order: 1
seeAlso: |
  - [API](./api.md)
  - [Benchmarks](/docs/benchmarks/overview)
---

# AJV adapter overview

`@xndrjs/domain-ajv` connects JSON Schema / OpenAPI schemas to `@xndrjs/domain`.

It is useful when your source of truth is:

- JSON Schema documents
- OpenAPI component schemas
- AJV runtime validation in backend pipelines

## Install

```bash
pnpm add @xndrjs/domain-ajv ajv ajv-formats
```

The adapter exposes both a default instance API and a configurable factory (`createAjvDomainAdapter`).
