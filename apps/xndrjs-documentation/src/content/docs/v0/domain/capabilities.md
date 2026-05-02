---
title: Capabilities
description: Attach validated behavior to shape kits while keeping instances data-only.
---

Capabilities attach behavior to shape kits while keeping instances as plain immutable data.

```text
data is not responsible for its own evolution
```

## Why behavior lives on kits

Domain entities often need operations: rename, verify, cancel, approve, archive.

`xndrjs` models those operations as kit methods:

```ts
const updated = User.rename(existingUser, "New Name");
```

not as instance methods:

```ts
existingUser.rename("New Name");
```

This keeps the value easy to serialize, test, pass through UI state, and move between layers if no mapping is needed. The behavior is still inside the domain layer, because it lives on the `User` kit.

## Basic capability

```ts
import { domain } from "@xndrjs/domain";

const renameCapability = domain.capabilities<{ name: string }>().methods((patch) => ({
  rename(entity, nextName: string) {
    return patch(entity, { name: nextName });
  },
}));

const User = renameCapability.attach(UserShape);
const updated = User.rename(existingUser, "New Name");
```

The `patch` function is only available inside the capability factory. That keeps updates close to named domain operations.

It also prevents `patch` from being accidentally exported as a generic "do anything" method. In practice, shape transitions must be declared and named inside capabilities, not invented from random points in the application.
This gives you behavior encapsulation: every allowed operation on a shape is explicit in one place, so the domain keeps a clear overview of how that shape is allowed to evolve.

## Validated transitions

Every `patch` re-enters the shape validator before returning.

```ts
const User = domain
  .capabilities<{ displayName: string; isVerified: boolean }>()
  .methods((patch) => ({
    rename(user, displayName: string) {
      return patch(user, { displayName });
    },
    verify(user) {
      return patch(user, { isVerified: true });
    },
  }))
  .attach(UserShape);
```

If a transition would violate the shape validator, it fails the same way `create` would fail.

This is a major guarantee: every transition preserves data validity by default, without relying on developers to remember manual validation at each call site / at the end of each transition.

## Reusable bundles

A capability bundle can attach to any compatible schema-only shape kit.

That is useful for common behavior such as:

- `rename`
- `archive`
- `activate`
- `markDeleted`
- `touchUpdatedAt`

Keep capability bundles small and named after domain actions, not generic setters.

## Constraints

- Attach capabilities to schema-only shape kits before adding other method bags.
- Capability method names cannot collide with reserved kit keys such as `create`, `safeCreate`, `is`, `type`, `validator`, or `project`.
- `patch` always re-validates with the shape validator.
- Instances remain frozen data records.
