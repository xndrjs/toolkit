---
title: Compose and pipe
description: Build small validators and readable transformation chains.
---

`@xndrjs/domain` includes two small utilities for adapter-free boundaries and readable transformations.

## compose

`compose` builds validators from other validators:

- `compose.optional(validator)`
- `compose.object(fields)`
- `compose.array(validator)`

Use it when validation is simple enough that introducing a schema engine would be unnecessary.

```ts
import type { Validator } from "@xndrjs/domain";
import { compose, domain } from "@xndrjs/domain";

const nonEmptyString: Validator<string> = {
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

Nested failures preserve issue paths such as `["displayName"]` or `[3, "name"]`.

## pipe

`pipe` composes unary transforms from left to right with static typing.

```ts
import { pipe } from "@xndrjs/domain";

const result = pipe(
  " 42 ",
  (s) => s.trim(),
  Number, // or (s) => Number(s)
  (n) => n * 2
);
// result === 84
```

It is especially useful when a workflow establishes guarantees in sequence:

```ts
const readyForBilling = pipe(user, VerifiedUser.assert, BillingProfileComplete.assert);
```

Each function receives the previous output. The resulting type reflects the guarantees established by the pipeline.
