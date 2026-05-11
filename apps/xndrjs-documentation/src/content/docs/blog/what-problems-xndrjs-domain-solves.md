---
title: "What problems does @xndrjs/domain actually solve?"
description: A concrete tour of runtime trust at boundaries, ergonomic domain construction, layer-friendly data, shape transformations, and where invariants live, beyond “we like types.”
date: 2026-05-11
tags:
  - domain
  - typescript
  - architecture
---

Documentation and previous blog posts explain _how_ `xndrjs` works. A fair follow-up question is narrower and more urgent:

> Yes, fine, but **what concrete problems** does `@xndrjs/domain` solve in day-to-day code?

Below are some of the reasons why I decided to work on this project.

---

## 1. Static types are not enough at external boundaries

When data comes from outside your process — REST responses, query strings, forms... — you are not looking at “a `UserDTO`.” You are literally looking into the `unknown`.

You still want to map that payload into something your application understands. But what is the most common way to do this?

`return data as UserDto`

The painful failure here is not caught by static typing. It is a **silent drift**:

- the mapping runs
- corrupted or partial data spreads
- you only notice deep inside business logic, or in the UI, when assumptions explode

Runtime validation plus a small mapping step gives you **fail-fast boundaries**. If the contract is wrong, you learn immediately at the edge, not three layers later. That is disproportionately valuable in growing systems, where “bad data” is expensive precisely because it is ordinary.

---

## 2. Creating domain values without drowning in ceremony

Rich domain models built from classes are elegant. But they also tend to accumulate **construction friction**: nested constructors, factories for value objects, repetitive wiring just to build a valid aggregate.

`xndrjs` leans into a different ergonomics:

- write the payload **as a normal object literal**
- pass it through a **single creation path** that validates

Nested structure does not force you to manually instantiate every sub-shape or primitive wrapper if the shape’s validator already composes its parts. The parent validation orchestrates the children. That keeps call sites readable and reduces “domain boilerplate theater.”

Compare the **call site** for the same aggregate in a stylized rich OOP model (nested value objects) versus `domain.shape` as in [Primitives and shapes](/v0/domain/primitives-shapes/).

Rich OOP-style construction: every nested piece is its own type and constructor.

```ts
const user = new User(
  UserId.from("u_1"),
  Email.from("alice@example.com"),
  new Address(Street.from("1 Main St"), City.from("Paris"))
);
```

Same idea with `xndrjs`: you define validation once (here with Zod via `@xndrjs/domain-zod`, like the doc); the nested object stays a **plain** literal at the boundary.

```ts
import { domain, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const EmailKit = domain.primitive("Email", zodToValidator(z.email()));

const AddressKit = domain.shape(
  "Address",
  zodToValidator(
    z.object({
      street: z.string().min(1),
      city: z.string().min(1),
    })
  )
);

const User = domain.shape(
  "User",
  zodToValidator(
    z.object({
      id: z.string().min(1),
      email: zodFromKit(EmailKit), // compose existing Email Kit
      address: zodFromKit(AddressKit), // compose existing Address Kit
    })
  )
);

const user = User.create({
  id: "u_1",
  email: "alice@example.com",
  address: { street: "1 Main St", city: "Paris" },
});
```

---

## 3. Moving data across layers without turning the codebase into Mapper City

The representation `xndrjs` encourages is **data-centric**: validated values without behavior welded onto instances. That matters when you cross boundaries inside your own application:

- infrastructure (HTTP, persistence)
- orchestration / application use cases
- domain rules
- presentation

Plain, validated data travels cleanly. You still introduce mappers when semantics genuinely diverge, but you are less tempted to create **1:1 mapping layers** whose only job is type gymnastics.

On the frontend specifically, stable referential identity still matters for reactive frameworks. Plain validated objects play well there. Unlike patterns that thread UI concepts deep into the model - say, reactive wrappers everywhere - `@xndrjs/domain` **does not depend** on view idioms. It composes nicely with modern FE when you want it to, and stays independent when you need it to.

---

## 4. Shape transformations when one underlying fact wears different hats

Complex domains often need **multiple typed views of the same underlying information**, for example:

- a generic representation for graph walks, dependency resolution, or path algorithms
- a stricter representation for a specific workflow or screen

Teams often bridge those views with object spreads and casts. That works until it does not: the rules live in scattered helpers, and nobody has a single place to read or trust them. **Projection** is the alternative: one explicit step that moves from one trusted shape to another and runs validation again. The transition stays visible in the code instead of implicit in utility functions.

---

## 5. Knowing where invariants and guarantees actually live

Anemic frontend models frequently scatter validation and sanity checks across components, hooks, and services. The result is hard to reason about:

- duplicated rules that will drift apart
- redundant checks nobody really trusts
- “fix it in the UI” patches that never migrate backward

`xndrjs` nudges you toward a clearer split:

- **baseline structural and local rules** live with the shape’s validator definition
- **stronger or cross-cutting guarantees** surface as explicit proofs where they belong

That helps newcomers answer a boring but critical question quickly: **“where do validation rules and other checks live?”** The answer has a default home instead of a scavenger hunt.

---

## 6. A well-defined domain pays down complexity elsewhere

Investing in the domain layer can feel like an extra step, especially when shipping pressure is high. The return is subtle but structural: the rest of the application stops improvising at the **wrong abstraction level**.

Infrastructure stops guessing. Application workflows stop re-solving parsing. UI stops compensating for missing guarantees. You still integrate frameworks and libraries; you simply avoid letting accidental coupling rewrite your mental model every week.

---

## Closing

`@xndrjs/domain` is not “types, but louder.” It is a toolkit for **trusted data**: where it enters, how it is built, how it moves, how it morphs, and where its promises are documented in code.

If your pain points match the list above (boundary rot, constructor fatigue, mapper sprawl, multi-shape reasoning, scattered validation, or leaky abstractions) the concrete payoff is easier to justify than another abstraction for its own sake.
