---
title: Primitive and shape
description: Primitive and shape modeling kits from the domain namespace
order: 3
seeAlso: |
  - [Proof](./proof.md)
  - [Capabilities](./capabilities.md)
  - [Validator and errors](./validator-and-errors.md)
---

# Primitive and shape

Two core `domain` kits for values materialized at trust boundaries. For semantic guarantees on top of validation, see [Proof](./proof.md).

The central idea is:

```
if a piece of data was created, then it's valid
```

In `xndrjs`, this guarantee is enforced through **primitives** and **shapes**, which represent trusted data boundaries.

- **Primitives** model atomic, semantically meaningful values (e.g. `Email`, `UserId`, `Currency`).
- **Shapes** model structured, validated representations (e.g. `User`, `Order`, `Profile`).

Both share the same core properties:

- they validate input at creation time
- they produce immutable, readonly values
- they attach a **brand** to the result

The brand is not just a type-level trick. It encodes a crucial semantic guarantee:

```
this value has passed a specific validation boundary
```

This means that once a value exists as a primitive or shape instance:

- it is known to be structurally valid
- it can be safely consumed without re-checking its structure
- it cannot be accidentally confused with unvalidated data

This approach eliminates an entire class of bugs where invalid data leaks into the system, and shifts validation from being a scattered concern to a **single, explicit step at the boundary**.

In practice, this leads to a very simple mental model:

```
unknown input → validated once → trusted forever (within that boundary)
```

As a result, primitives and shapes act as foundational building blocks for modeling a domain where correctness is enforced by construction, not by convention.

## `domain.primitive`

Use for scalar-like values with nominal typing.

```typescript
import { domain } from "@xndrjs/domain";
import { zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = domain.primitive("Email", zodToValidator(z.email()));
const email = Email.create("alice@example.com");
```

Runtime value remains a plain scalar; nominal distinction is type-level.

## `domain.shape`

Use for object entities validated at boundaries, then frozen.

```typescript
const User = domain.shape(
  "User",
  zodToValidator(z.object({ id: z.string(), name: z.string().min(1) }))
);

const user = User.create({ id: "u_1", name: "Alice" });
```

`shape` kits also support:

- `safeCreate(input)`
- `is(value)`
- `project(instance, targetKit)`
