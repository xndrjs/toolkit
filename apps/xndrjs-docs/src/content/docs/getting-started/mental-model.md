---
title: Mental model
description: The trust-boundary model behind xndrjs domain packages
order: 2
seeAlso: |
  - Build a complete model in [First model](./first-model.md)
  - Read the [Domain overview](/docs/domain/overview)
---

# Mental model

`xndrjs` is built around one practical idea:

```text
unknown data becomes useful only after it crosses an explicit trust boundary
```

The toolkit does not try to replace your validation library, your framework, or your
application architecture. It gives you a small set of domain building blocks that make
trust explicit and easy to preserve as data moves through your system.

## The flow

Most `xndrjs` domain code follows this shape:

```text
external input
  -> adapter validator
  -> primitive / shape
  -> capability transition
  -> proof when you need a stronger guarantee
  -> orchestration, UI, storage, or another boundary
```

In code, that means:

```typescript
const user = User.create(raw); // create validated instance
const verified = User.verify(user); // use a capability to evolve data

function someExclusiveFunction(user: User) {
  const proven = VerifiedUser.assert(verified);
  // now you're sure the caller passed this function a verified user
  console.log(proven.isVerified); // will always be true
}
```

Each step has a different job. That separation is the core of the toolkit.

## The four domain jobs

| Concept        | Job                                         | Example                                    |
| -------------- | ------------------------------------------- | ------------------------------------------ |
| `Validator`    | Parse or validate unknown input             | Zod, Valibot, AJV, or a custom validator   |
| `primitive`    | Give semantic meaning to scalar-like values | `Email`, `UserId`, `Currency`              |
| `shape`        | Create a trusted immutable representation   | `User`, `Order`, `Profile`                 |
| `proof`        | Establish an extra semantic guarantee       | `VerifiedUser`, `PaidOrder`                |
| `capabilities` | Express allowed transitions                 | `User.verify(user)`, `Order.cancel(order)` |

The important part is that these are not aliases for the same thing. A schema can prove
structure, a shape can establish representation identity, a proof can add meaning, and a
capability can evolve data without mutating it.

## Why adapters exist

Adapters translate existing schema engines into the minimal `xndrjs` contract:

```typescript
interface Validator<Input, Output = Input> {
  readonly engine: string;
  validate(input: unknown): ValidationResult<Output>;
}
```

This lets you keep domain code stable even when different boundaries use different
validation engines.

For example:

- use Zod in a form-heavy frontend boundary
- use AJV for OpenAPI or JSON Schema payloads
- use Valibot where bundle size or parser composition matters
- keep the same `domain.shape`, `domain.proof`, and capability model

The adapter is not the domain model. The adapter is the doorway into the domain model.

## Plain data, explicit behavior

`xndrjs` shape instances are immutable data records. They do not carry methods.

Behavior lives on kits:

```typescript
const next = User.rename(user, "Ada");
```

not on instances:

```typescript
user.rename("Ada");
```

This keeps domain values simple to pass through UI, orchestration, tests, storage, and
transport layers. When a transition changes data, it goes through `patch`, and `patch`
validates again before returning a new frozen instance.

## The rule of thumb

Use this mental checklist:

1. If data came from outside, call `create` or `safeCreate`.
2. If a value needs a name and semantic meaning, make it a `primitive`.
3. If an object is a trusted representation, make it a `shape`.
4. If a workflow needs a stronger guarantee than the base shape, make it a `proof`.
5. If data changes, put the transition in a `capability`.
6. If your boundary already has a schema engine, adapt it instead of rewriting it.

The result is a simple loop:

```text
validate -> trust -> evolve through validated transitions -> prove when needed
```
