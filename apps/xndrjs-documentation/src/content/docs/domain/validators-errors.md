---
title: Validators and errors
description: The validation contract, result union, and normalized domain failures.
---

Every domain kit relies on the same contract:

```ts
interface Validator<Input, Output = Input> {
  readonly engine: string;
  validate(input: unknown): ValidationResult<Output>;
}
```

`Input` describes what creation APIs accept. `Output` describes the trusted value after validation or parsing. `validate` receives `unknown`, so runtime narrowing stays explicit.

## ValidationResult

Validators return a discriminated union:

```ts
type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ValidationFailure };
```

Failure shape:

```ts
type ValidationFailure = {
  engine: string;
  issues: readonly ValidationIssue[];
  raw?: unknown;
};

type ValidationIssue = {
  code: string;
  path: readonly (string | number)[];
  message: string;
  meta?: unknown;
};
```

Adapters normalize their native error objects into this shape. You can log, map, or display failures consistently even when the underlying engine is Zod, Valibot, AJV, or custom code.

## Throwing vs safe APIs

Use throwing APIs at boundaries where invalid data should stop the workflow:

```ts
const user = User.create(raw);
const verified = VerifiedUser.assert(user);
```

Use safe APIs when you need to branch without exceptions:

```ts
const result = User.safeCreate(raw);

if (!result.success) {
  return { status: 400, issues: result.error.issues };
}

return result.data;
```

## DomainValidationError

`create` and `assert` throw `DomainValidationError` when validation fails.

The error exposes:

- `code: "DOMAIN_VALIDATION_ERROR"`
- `failure`: the full `ValidationFailure`
- `issues`: quick access to `failure.issues`

This keeps domain errors structured without forcing every caller to know the original schema engine.

## Custom validator example

```ts
import type { Validator } from "@xndrjs/domain";

const nonEmptyString: Validator<string> = {
  engine: "custom",
  validate(input) {
    if (typeof input === "string" && input.length > 0) {
      return { success: true, data: input };
    }

    return {
      success: false,
      error: {
        engine: "custom",
        issues: [{ code: "invalid", path: [], message: "Expected non-empty string" }],
      },
    };
  },
};
```
