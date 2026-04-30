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

This keeps the value easy to serialize, test, pass through UI state, and move between layers. The behavior is still close to the domain concept because it lives on the `User` kit.

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
