---
title: Pipe utility
description: Typed left-to-right composition with pipe
order: 7
seeAlso: |
  - [Compose helpers](./compose.md)
---

# Pipe utility

`pipe` composes unary transforms from left to right with static typing.

```typescript
import { pipe } from "@xndrjs/domain";

const result = pipe(
  " 42 ",
  (s) => s.trim(),
  (s) => Number(s),
  (n) => n * 2
);
// result === 84
```

Use it to keep normalization chains readable in domain factories and adapter-agnostic workflows.

`pipe` is especially useful when you want to show a sequence of guarantees:

```typescript
const readyForBilling = pipe(user, VerifiedUser.assert, BillingProfileComplete.assert);
```

Each function receives the previous output. The resulting type accumulates what the
pipeline established.
