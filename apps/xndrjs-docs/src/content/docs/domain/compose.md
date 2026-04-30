---
title: Compose helpers
description: Build validators with compose.array, compose.object, and compose.optional
order: 6
seeAlso: |
  - [Validator and errors](./validator-and-errors.md)
---

# Compose helpers

`compose` provides lightweight validator builders without depending on a third-party schema engine.

## `compose.optional`

```typescript
const nickname = compose.optional(stringValidator);
```

## `compose.object`

```typescript
const userValidator = compose.object({
  id: stringValidator,
  nickname: compose.optional(stringValidator),
});
```

## `compose.array`

```typescript
const usersValidator = compose.array(userValidator);
```

These helpers preserve issue paths (`["field"]`, `[3, "name"]`, etc.) in failures, so nested diagnostics remain actionable.
