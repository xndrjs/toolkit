---
title: Capabilities
description: Attach domain methods to shape kits
order: 5
seeAlso: |
  - [Primitive and shape](./primitive-shape-proof.md)
---

# Capabilities

Capabilities let you attach behavior to shape kits while keeping instances data-only.

## Behavior is External

`data is not responsible for its own evolution`

Entities do not carry methods.

Behavior lives outside, as:

- capabilities
- use cases
- orchestration

This makes the domain:

- easier to test
- easier to compose
- less coupled to representation
- easier to pass through architectural layers without leaking logic

```typescript
import { domain } from "@xndrjs/domain";

const renameCapability = domain.capabilities<{ name: string }>().methods((patch) => ({
  rename(entity, nextName: string) {
    return patch(entity, { name: nextName });
  },
}));
```

Then attach to a schema-only shape kit:

```typescript
const User = renameCapability.attach(UserBase);
const updated = User.rename(existingUser, "New Name");
```

The method lives on the kit. The instance stays a frozen data record, so it can move
through UI, orchestration, and persistence without carrying behavior.

## Validated transitions

The `patch` function is deliberately provided only inside the capability factory. That
keeps updates close to named domain operations and ensures every transition re-enters the
shape validator.

```typescript
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

## Important constraints

- attach only to schema-only shape kits (before adding other method bags)
- capability method names cannot collide with reserved kit keys (`create`, `safeCreate`, `is`, `type`, `validator`, `project`)
- `patch` always re-validates using the shape validator before returning
- reusable capability bundles can attach to any compatible schema-only shape kit
