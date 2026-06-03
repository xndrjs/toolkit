---
title: "5 cases where TypeScript types are not enough to guarantee data correctness"
description: External boundaries, structural typing, mutation, contextual guarantees, and semantic aliases—why structure is not trust, and what runtime validation and explicit boundaries add.
date: 2026-05-20
author: Fabio Fognani
tags:
  - typescript
  - domain
  - validation
---

TypeScript is excellent at describing the shape of values inside your codebase.

But many correctness problems in real applications do not come from writing the wrong property name.

This article explores five common situations where TypeScript alone is not enough to guarantee correctness — and why runtime validation, semantic boundaries, and controlled transformations matter in real-world scenarios.

---

## 1. External boundaries destroy compile-time guarantees

Consider this code:

```ts
type User = {
  email: string;
};

const user = (await response.json()) as User;
```

Looks kind of safe (as we assume to know what the response looks like), but it isn’t.

At runtime, `response.json()` returns:

```text
unknown
```

not `User`.

The server could return:

```json
{
  "email": null
}
```

or:

```json
{
  "wrongField": true
}
```

or:

```json
"some weird error"
```

Of course, TypeScript cannot validate runtime input.

This applies everywhere external data enters your system, for example

- HTTP responses
- forms
- local storage
- environment variables
- queues
- route params

The important realization is:

> Compile-time types stop at runtime boundaries.

This is why runtime validation exists in the first place.

A value only becomes trustworthy after crossing an explicit validation boundary:

```text
unknown → validate → trusted value
```

That pattern is the starting point of the [mental model](/v0/getting-started/mental-model/) behind `xndrjs`, and the motivation behind posts like [What problems does @xndrjs/domain actually solve?](/blog/what-problems-xndrjs-domain-solves/).

---

## 2. Structural typing confuses semantically different values

TypeScript uses structural typing.

That means two values are considered compatible if their structure matches.

Example:

```ts
type UserId = string;
type PostId = string;

function loadPost(postId: PostId) {}

const userId: UserId = "u_123";

loadPost(userId);
```

TypeScript accepts this: structurally, both are just strings.

Semantically, they represent completely different concepts. So TypeScript isn't "wrong", but it's not the right tool for enforcing this kind of concept.

This becomes dangerous at scale because many important domain values share the same primitive representation:

- `Email`
- `Url`
- `UserId`
- `CurrencyCode`
- `Slug`
- `SessionToken`

Without nominal semantics, the type system cannot distinguish them.

This is where branded or nominal types become useful:

```ts
type UserId = Branded<"UserId", string>;
type PostId = Branded<"PostId", string>;
```

Now the system can distinguish:

```text
“this is a string”
```

from:

```text
“this is specifically a PostId”
```

In `@xndrjs/domain`, primitives carry that distinction at the type level and enforce membership at runtime via a `Validator` — see [Primitives and shapes](/v0/domain/primitives-shapes/).

The important insight is:

> Structural compatibility is not semantic compatibility.

---

## 3. Valid data can become invalid after creation

Validation at creation time is not enough if values can later be mutated arbitrarily.

Example:

```ts
const user = validateUser(payload);

user.email = "";
user.role = "super-admin";
```

The object was valid once.

Now it is not.

The problem is not validation: the problem is **uncontrolled evolution**.

In many codebases, data is validated at boundaries but then freely mutated across components, hooks, services, reducers, and utilities.

At that point:

> correctness becomes assumed, not guaranteed.

A more reliable approach is:

- validate values once
- make representations immutable
- allow transformations only through explicit operations

For example:

```text
validate → trusted value → controlled transformations
```

instead of:

```text
validate → mutable object → hope for the best
```

`xndrjs` shapes are immutable after `create`, and evolution goes through [capabilities](/v0/domain/capabilities/) - named transitions instead of ad hoc property writes.

The goal is not "absolute safety”.

The goal is:

> making invalid evolution harder than correct evolution.

---

## 4. Types cannot express contextual guarantees

Sometimes a value is structurally valid, but still missing an important guarantee.

Example:

```ts
type User = {
  isVerified: boolean;
};
```

Now imagine a function:

```ts
function accessPremiumFeature(user: User) {
  // ...
}
```

The type allows both:

```ts
{
  isVerified: true;
}
```

and:

```ts
{
  isVerified: false;
}
```

But maybe the function actually requires:

```text
a verified user
```

not merely “a user with a boolean field”.

The issue is that many guarantees are contextual, not structural.

A boolean field alone does not encode:

```text
this value has already passed verification
```

What we really want is something closer to:

```ts
type VerifiedUser = User & {
  isVerified: true;
};
```

or a dedicated proof/refinement step.

In `xndrjs`, that second path is a [`proof`](/v0/getting-started/first-model/#add-a-proof-when-meaning-gets-stronger): an explicit **runtime** semantic step. You call `assert` or `test` when a workflow needs a stronger guarantee than the base shape already carries — usually after validation or a capability transition. The proof re-checks the value at that moment; only then does the system treat the stronger meaning as established.

If you also want a narrower TypeScript view, you layer it on top with `refineType` — for example so that, after `VerifiedUser.test(user)` succeeds, `isVerified` is known to be `true`. The proof is the executed step; the narrowed type is what the compiler can infer **from** that step, not a substitute for it.

The distinction worth keeping:

> A proof is something the runtime did. A narrowed type is something the compiler can learn after that step succeeded.

---

## 5. Type aliases cannot validate semantic constraints

Consider this:

```ts
type Email = string;
```

This looks right, but of course TypeScript still accepts

```ts
const email: Email = "not-an-email";
```

because

```text
Email is still just a string
```

The alias changes the name, not the runtime semantics.

TypeScript cannot:

- run regex validation
- parse values
- check formats
- enforce runtime invariants
- validate cross-field relationships

So this:

```ts
type Email = string;
```

does **not** mean:

```text
this is a valid email
```

It only means:

```text
someone decided to call this string “Email”
```

This is why runtime validation matters.

A semantic type is not just a renamed primitive.

It is:

```text
a validated guarantee about membership in a set of allowed values
```

In other words:

```text
unknown → validate → Email
```

is fundamentally different from:

```ts
type Email = string;
```

The first establishes trust.

The second only establishes terminology.

Use `domain.primitive("Email", validator)` and you get both: a nominal type _and_ runtime membership checks at the boundary.

---

## The missing concept: trust

All five problems above point to the same underlying issue:

> TypeScript does not model trust.

It models structure. And it's completely fine: it's what it's meant to do.

Your application, however, interacts constantly with:

- unknown runtime input
- external systems
- evolving state
- semantic guarantees
- contextual correctness

This is where types are not enough, and **trust** begins to matter.

The core idea behind `xndrjs` is simple:

> data should cross explicit trust boundaries exactly once,
> then become hard to corrupt accidentally.

That leads to a model where:

- external data starts as `unknown`
- runtime validation establishes trust
- representations become immutable
- transformations are explicit
- stronger guarantees can be layered progressively

The goal is not theoretical purity.

It is reducing ambiguity in real systems.

Because at scale, most correctness bugs are not caused by missing semicolons.

They are caused by the system believing something that was never actually guaranteed.

If you want the toolkit side of this story next, start with the [mental model](/v0/getting-started/mental-model/) and [first model](/v0/getting-started/first-model/) guides, or the [interop demo](https://github.com/xndrjs/toolkit/tree/main/apps/interop-demo) for mixed validators (Zod, Valibot, core) on the same domain types.
