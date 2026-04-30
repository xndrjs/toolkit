---
title: Compose helpers
description: Build validators with compose.array, compose.object, and compose.optional
order: 6
seeAlso: |
  - [Validator and errors](./validator-and-errors.md)
---

# Compose helpers

`compose` provides lightweight validator builders without depending on a third-party schema engine.

Use it when your validation needs are simple and you do not want to introduce an adapter
at that boundary.

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

## Small complete example

```typescript
import type { Validator } from "@xndrjs/domain";
import { compose, domain } from "@xndrjs/domain";

const nonEmptyString: Validator<unknown, string> = {
  engine: "custom",
  validate(input) {
    if (typeof input !== "string" || input.length === 0) {
      return {
        success: false,
        error: {
          engine: "custom",
          issues: [{ code: "invalid", path: [], message: "Expected non-empty string" }],
        },
      };
    }

    return { success: true, data: input };
  },
};

const User = domain.shape(
  "User",
  compose.object({
    id: nonEmptyString,
    displayName: nonEmptyString,
    nickname: compose.optional(nonEmptyString),
  })
);

const user = User.create({ id: "user_1", displayName: "Ada" });
```
