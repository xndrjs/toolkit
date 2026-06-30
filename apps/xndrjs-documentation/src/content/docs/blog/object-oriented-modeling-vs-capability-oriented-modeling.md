---
title: "Object-Oriented Modeling vs Capability-Oriented Modeling"
description: How COM organizes behavior around semantic contracts instead of object ownership—and why that makes domain models easier to evolve and boundary-safe by construction.
date: 2026-06-30
author: Fabio Fognani
tags:
  - domain
  - architecture
---

Object-Oriented Programming has shaped the way many of us think about software.

When modeling a domain, the instinct is almost automatic:

> Create a class.
> Put the data inside it.
> Put the behavior next to the data.

This idea has served our industry remarkably well. In fact, Rich Domain Models are often presented as the natural counterpart to anemic models: if behavior belongs close to the data, why separate the two?

Capability-Oriented Modeling (COM), the modeling approach adopted by [xndrjs](/latest/getting-started/introduction/), starts from the same intuition but reaches a different conclusion.

Behavior should indeed stay close to the data.

But **close** doesn't necessarily mean **inside**.

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

None of these methods are inherently wrong.

In fact, many of them genuinely belong to the concept of a user.

The issue is subtler.

In object-oriented modeling, the class is simultaneously:

- the representation of the data,
- the owner of the behavior,
- and the unit of behavioral composition.

As soon as a class becomes the canonical representation of some data, it also becomes the obvious place to add new behavior.

The object develops what could be called **behavioral gravity**, where every new operation is naturally attracted towards it.

This doesn't necessarily produce a God Object: a well-designed Rich Domain Model can remain highly cohesive.

The real trade-off is different: **Rich object models organize behavior around data ownership.**

---

## Capability-Oriented Modeling

COM starts from a different point of view. Instead of asking:

> Which object owns this behavior?

it asks:

> Which behaviors belong together?

This seemingly small shift changes the unit of composition.

Instead of attaching behavior to objects, COM groups behavior into explicit **capabilities**.

Authentication capabilities. Verification capabilities. Profile capabilities.

Each capability operates on the same conceptual model, but only depends on the subset of data it actually requires.

For example, verification doesn't need to know about usernames, email addresses or profile pictures.

Conceptually, it only depends on something like:

```ts
{
  verifiedAt: Date | null;
}
```

Likewise, profile-related capabilities don't need verification data.

Each capability declares the minimum semantic contract it requires, not the complete shape that happens to exist today.

In `xndrjs`, that contract is explicit: a [capability](/v0/domain/capabilities/) is defined on a small contract, then attached to the full domain model when the operation becomes part of the public API. The reusable logic and the named domain operation stay distinct.

---

## A different kind of coupling

This has an interesting architectural consequence. In traditional object-oriented modeling, the complete object tends to become the center of composition. As the object grows, more and more behaviors accumulate around it.

In COM, the complete model becomes almost a **composition detail**. Capabilities are designed around semantic contracts, not around aggregate ownership. The model still provides a coherent view of the domain, but each capability only "sees" the part of the model that actually matters to it.

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

In COM, that separation often already exists: verification capabilities were never coupled to the entire `User` model.

They only depended on the semantic contract they actually required. Behavior is no longer tightly coupled to today's aggregate.

As a consequence, architectural evolution tends to follow the natural boundaries already expressed by the capabilities.

---

## Does COM replace Classes?

No, not at all.

Classes still solve problems that COM deliberately doesn't try to solve.

They provide:

- encapsulation / private state,
- inheritance,
- runtime polymorphism.

These remain valuable tools.

The difference is that they stop being the default modeling primitive.

A class can happily consume a COM model, perform complex calculations using encapsulation or polymorphism, and finally produce another model.

The rest of the application doesn't need to know whether a class was involved.

Classes become implementation tools, models remain the source of truth.

---

## Final thoughts

Capability-Oriented Modeling doesn't reject the central intuition behind Rich Domain Models: **behavior still belongs close to the data**.

What changes is **how behavior is organized**.

Object-Oriented Modeling organizes behavior around objects.

Capability-Oriented Modeling organizes behavior around capabilities.

That shift makes behavior easier to split, evolve and compose without continuously reshaping the underlying models. The domain model remains coherent, behavior remains cohesive, and the complete model gradually stops being the center of the architecture.

It becomes what it perhaps always should have been:

> **a stable composition of semantic contracts.**

Another important consequence is that domain behavior never leaks into infrastructure (transport layers, persistence adapters) or view-layer boundaries.

Since capabilities are not attached to the data model, the model itself remains a pure, serializable representation of state. Capabilities are separate modules: you can keep them private inside a package (no export, no leak), or restrict where they may be imported (lint rules, package boundaries, or architectural zones can forbid capability imports in transport, persistence, or UI layers). The data crosses those boundaries; the behavior stays where it belongs.

There is no behavior to strip, no hidden coupling to unwind, and no ad-hoc mapping layer whose only purpose is to neutralize rich objects before crossing boundaries.

The domain model is already boundary-safe by construction, with no need to turn your codebase into Mapper City!

For another look at how this plays out in `xndrjs`, see [Domain Algebra — between Rich and Anemic Data Modeling](/blog/xndrjs-domain-algebra-rich-anemic/).
