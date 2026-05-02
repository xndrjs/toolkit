---
title: Mental model
description: The trust-boundary model behind xndrjs.
---

`xndrjs` is built around one practical idea:

```text
unknown data becomes useful only after it crosses an explicit trust boundary
```

The toolkit does not replace your validation library or application framework. It gives you a small vocabulary for preserving trust as data moves through your system.

## The flow

Most code will follow this progression:

```text
external input
  -> adapter validator
  -> primitive or shape
  -> capability transition
  -> proof when a workflow needs a stronger guarantee
```

Now UI, orchestration, storage, transport, or another boundary can use safe domain data.

In code:

```ts
const user = User.create(raw);
const renamed = User.rename(user, "Ada Lovelace");
const verified = User.verify(renamed);
const proven = VerifiedUser.assert(verified);
```

The same flow in one expression with `pipe` (unary steps left-to-right) so you can avoid multiple `const`s:

```ts
import { pipe } from "@xndrjs/domain";

const proven = pipe(
  raw,
  User.create,
  (user) => User.rename(user, "Ada Lovelace"),
  User.verify,
  VerifiedUser.assert
);
```

Each operation has a distinct responsibility. That separation is the core of the toolkit.

## The five domain responsibilities

| Concept        | Responsibilities                                 | Example                                    |
| -------------- | ------------------------------------------------ | ------------------------------------------ |
| `Validator`    | Parse or validate unknown input                  | Zod, Valibot, AJV, or a custom validator   |
| `primitive`    | Give semantic meaning to scalar-like values      | `Email`, `UserId`, `CurrencyCode`          |
| `shape`        | Create a trusted immutable object representation | `User`, `Order`, `Profile`                 |
| `capabilities` | Express allowed transitions                      | `User.rename(user)`, `Order.cancel(order)` |
| `proof`        | Establish an extra semantic guarantee            | `VerifiedUser`, `PaidOrder`                |

A schema can prove structure. A shape establishes representation identity. A proof adds meaning. A capability evolves data through a named operation.

## Adapters are doorways, not the model

Adapters translate existing schema engines into the minimal `xndrjs` validator contract:

```ts
interface Validator<Input, Output = Input> {
  readonly engine: string;
  validate(input: unknown): ValidationResult<Output>;
}
```

That means your domain model can stay stable even if different boundaries use different validation engines:

- Zod for form-heavy frontend boundaries
- AJV for OpenAPI or JSON Schema payloads
- Valibot where bundle size or parser composition matters
- a custom validator where the boundary is already normalized

The adapter is the doorway into the domain model. The domain still speaks in `Email`, `User`, `VerifiedUser`, and `User.verify(user)`.

## Plain data, explicit behavior

Shape instances are immutable data records. They do not carry methods.

Behavior lives on kits:

```ts
const next = User.rename(user, "Ada");
```

not on instances:

```ts
user.rename("Ada");
```

This keeps values easy to pass through UI state, orchestration functions, tests, storage, JSON, and queues. When a transition changes data, it goes through `patch`; `patch` validates again and returns a new frozen value.

## The rule of thumb

1. If data came from outside, call `create` or `safeCreate`.
2. If a scalar value needs a domain name, make it a `primitive` (i.e. `OrderId`, `EmailAddress`...).
3. If an object is a trusted representation, make it a `shape` (i.e. `User`, `Order`...).
4. If data needs to be changed, put the transition in a `capability` (i.e. `DocumentEditorCapabilities`, ...).
5. If a workflow requires a stronger guarantee than the base shape, make it a `proof` (i.e. `VerifiedUser`, `AdultAgeCustomer`, ...).

The loop is:

```text
validate -> trust -> evolve through validated transitions -> prove when needed
```
