---
title: "Object-Oriented Modeling vs Trusted Shape Modeling"
description: Unlike OOP classes that bundle data and behavior together, trusted shapes keep validated immutable data separate from explicitly attached capabilities, making domain models easier to evolve and boundary-safe by construction.
date: 2026-07-02
author: Fabio Fognani
tags:
  - domain
  - architecture
---

What does it mean to define a domain? At its core, it means creating **data structures** and **operations on those structures** so the code can represent business concepts — a `User`, an `Order`, a `Payment` — and the rules that govern how they may change.

Historically, two approaches dominate:

- **Rich domain models** bundle data and behavior together, usually through classes (Object-Oriented Programming). Properties hold the state, methods perform the operations - and, if you write them well, they **prevent invalid updates** (i.e. setting an invalid email address into an `email` property).
- **Anemic domain models** keep data as plain objects (you know, the dear old `{ foo: "bar" }`), and place the operations elsewhere. The model describes _what_ the data looks like; separate functions describe _what you can do with it_.

Each style solves real problems. Rich models keep rules close to the data they protect: `user.setEmail("...")` is easy to discover, and a well-designed class can refuse invalid transitions on the spot — if every method remembers to validate.

Anemic models are often simpler to serialize, pass across layers, and hold in UI state: there is no behavior attached to the object itself. **The same burden applies here too:** external functions must remember to validate after state transitions.

Rich models are often presented as the natural counterpart to anemic ones: if behavior belongs close to the data, why separate the two? OOP looks like the stronger answer. But the choice is not that simple.

Both styles introduce real trade-offs. Rich models tend to require explicit mapping to a plain, behavior-free structure, whenever you pass data across a boundary where behavior should not travel (transport, persistence, or the view, for example). In practice, that often means DTOs, mappers, and duplicate types: at least one mapping per class, maintained by hand.

Over time, classes can also accumulate **behavioral gravity**: once a class becomes the canonical representation of some data, every new operation is naturally attracted to it.

On the other hand, anemic models spread logic across the codebase and lean on convention, or scattered helpers, to prevent data from being changed in invalid ways. It is easy to lose track of which functions are mutating the data — and whether they are doing it correctly.

## A third model

The modeling approach adopted by [xndrjs](/latest/getting-started/introduction/) starts from these considerations, weighs the trade-offs of each style, and looks for a third solution that keeps the best of both worlds.

Behavior should indeed stay close to the data. But **close** doesn't necessarily mean **inside**.

Domain operations live _alongside_ the model as [capabilities](/v0/domain/capabilities/) you bind to a shape through an explicit **`attach`** step — not as methods baked into the data itself.

**Attached** means that wiring is intentional: it is declared and bound to a named shape, so you know that capability **is meant** to be called on that data structure.

Compare the two styles, first OOP:

```ts
import { z } from "zod";

const emailSchema = z.email();

// OOP: data and behavior share one type
class User {
  constructor(private email: string) {}

  setEmail(next: string) {
    // validation is manual: you must remember it in every setter
    this.email = emailSchema.parse(next);
    // skip it once, and invalid data enters the model!
    // this.email = next;
  }
}

const user = new User("ada@example.com");
// throws only if you remembered to validate
user.setEmail("not-an-email");
```

Did you notice? We forgot validation in the constructor. _OOPs_! (Object Oriented Mistake)

```ts
const user = new User("not-an-email"); // would not throw
```

Then we have `xndrjs`. We start with the model, a `UserShape`:

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

// xndrjs: the shape is data-only; capabilities attach separately
const UserShape = domain.shape(
  "User",
  // use Zod adapter as validator
  zodToValidator(
    // define the schema of this Shape
    z.object({
      email: z.email(),
    })
  )
);
```

Then we define its capabilities and attach them to the model:

```ts
const UserKit = domain.capabilities
  .forShape<{ email: string }>()
  .methods(({ patch }) => ({
    setEmail(user, email: string) {
      // whole shape re-validates automatically
      return patch(user, { email });
    },
  }))
  .attach(UserShape);

const user = UserShape.create({ email: "ada@example.com" });
// fails here — no extra check to remember
const updated = UserKit.setEmail(user, "not-an-email");
```

You cannot change a **Shape** by directly writing to its properties; you can only change it through one of those explicitly bound operations. Each change re-validates the whole shape, so after creation — or after any allowed transition — you always hold a **trusted** instance: data that has been checked and stays immutable until the next valid operation.

That's why I call it **Trusted Shape Modeling**.

---

## The gravity of Rich Objects

Imagine a `User` model.

As the system evolves, new behaviors naturally emerge:

- `setUsername()`
- `setEmail()`
- `activate()`
- `deactivate()`
- `verify()`
- ...

None of these methods are inherently wrong: in fact, many of them genuinely belong to the concept of a user. The issue is subtler.

In object-oriented modeling, the class is simultaneously:

- the representation of the data
- the owner of the behavior

As soon as a class becomes the canonical representation of some data, it also becomes the obvious place to add new behavior.

The object develops what could be called **behavioral gravity**, where every new operation is naturally attracted towards it.

Left unchecked, this dynamic often produces **God Objects**: aggregate classes that accumulate many responsibilities, because the type that owns the data becomes the default place for every new operation that touches it.

The underlying trade-off is structural: **rich object models organize behavior around data ownership**. A class is not only the container for state; it is also the primary **unit of behavioral composition**. If two operations need the same data, they converge on the same type — not because the domain demands it, but because ownership makes that the path of least resistance.

That keeps related logic easy to find, but it also couples independent concerns to a single aggregate and makes later separation costly: extracting a subset of capabilities means first disentangling behavior from the object that owns the data.

---

## Trusted Shape Modeling

As above, TSM reframes the starting point. Instead of asking:

> Which object owns this behavior?

it asks:

> Which behaviors belong together?

This seemingly small shift changes the unit of composition.

Instead of attaching behavior to objects, TSM groups behavior into explicit **capabilities** and binds them to shapes through `attach`. Each capability operates on the same conceptual model, but only depends on the subset of data it actually requires.

For example, user verification doesn't need to know about usernames, email addresses or profile pictures.

Conceptually, it only depends on something like:

```ts
{
  verifiedAt: Date | null;
}
```

Likewise, profile-related capabilities don't need verification data.

Each capability declares the minimum semantic contract it requires, not the complete shape that happens to exist today.

In `xndrjs`, that contract is explicit: a capability is defined on a small interface, then attached to the full domain model when the operation becomes part of the public API. The reusable logic and the named domain operation stay distinct — and only attached capabilities are allowed to evolve the shape.

---

## From object-centric to contract-centric behavior

This has an interesting architectural consequence. In traditional object-oriented modeling, the complete object tends to become the center of composition. As the object grows, more and more behaviors accumulate around it.

In TSM, the complete model becomes almost a **composition detail**. Capabilities are designed around semantic contracts, not around aggregate ownership. The model still provides a coherent view of the domain, but each capability only "sees" the part of the model that actually matters to it.

This significantly reduces coupling between independent behavioral concerns.

---

## Evolution becomes easier

Imagine starting with a single bounded context containing:

- Profile
- Authentication
- Verification

Sharing a common `User` model is perfectly reasonable.

Later, however, verification evolves independently. Maybe it becomes its own package, maybe it becomes a separate bounded context.

In many object-oriented designs, separating it means first disentangling behavior from the object that owns it.

In TSM, that separation often already exists: verification capabilities were never coupled to the entire `User` model.

They only depended on the semantic contract they actually required. Behavior is no longer tightly coupled to today's aggregate.

As a consequence, architectural evolution tends to follow the natural boundaries already expressed by the capabilities. That has an important side effect: if you define capabilities with the right contract, you get an explicit hint about where the borders of your bounded-contexts might be traced — not a full map, but certainly a starting point.

---

## Does TSM replace Classes?

No, not at all.

Classes still solve problems that TSM deliberately doesn't try to solve.

They provide:

- encapsulation / private state,
- inheritance,
- runtime polymorphism.

These remain valuable tools.

The difference is that they stop being the default modeling primitive.

A class can happily consume a trusted shape, perform complex calculations using encapsulation or polymorphism, and finally produce another trusted shape.

The rest of the application doesn't need to know whether a class was involved.

Classes become implementation tools, models remain the source of truth.

---

## Final thoughts

Trusted Shape Modeling doesn't reject the central intuition behind Rich Domain Models: **behavior still belongs close to the data**.

What changes is **how behavior is organized** and **what guarantees the data carries with it**.

Object-Oriented Modeling organizes behavior around objects.

Trusted Shape Modeling organizes behavior around capabilities attached to validated, immutable shapes.

That shift makes behavior easier to split, evolve and compose without heavily reshaping the underlying models. The domain model remains coherent, behavior remains cohesive, and the complete model gradually stops being the center of gravity for logic. It becomes **a stable composition of semantic contracts**.

Another important consequence is that domain behavior never leaks into infrastructure (transport layers, persistence adapters) or view-layer boundaries.

The shape itself is just data — already validated, already immutable. Capabilities are separate modules: you can keep them private inside a package (no export, no leak), or restrict where they may be imported (lint rules, package boundaries, or architectural zones can forbid capability imports in transport, persistence, or UI layers). The trusted shape crosses those boundaries; the behavior stays where it belongs.

There is no behavior to strip, no hidden coupling to unwind, and no ad-hoc mapping layer whose only purpose is to neutralize rich objects before crossing boundaries.

In the end, **Trusted Shape Modeling** does not ask you to abandon objects or embrace anemic data. It advices for a sharper split: shapes carry validated, portable state; capabilities carry the operations that may change it. Behavior stays **close** to the data, but only crosses the boundaries you explicitly allow. The model stays coherent, the guarantees stay structural, and evolution follows the capability boundaries you already sketched out — not a monolithic User (or Order) class that every feature kept extending.
