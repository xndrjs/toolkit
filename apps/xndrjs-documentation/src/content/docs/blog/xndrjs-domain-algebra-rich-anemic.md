---
title: "xndrjs Domain Algebra - between Rich and Anemic Data Modeling"
description: How the domain toolkit splits validation, representation, behavior, and guarantees without forcing a choice between rich classes and plain objects.
date: 2026-05-03
tags:
  - domain
  - architecture
---

## Preface - Rich and anemic data models

In many codebases, domain modeling tends to follow one of these two approaches:

- **Anemic domain models**  
  Data is represented as plain objects with little or no behavior attached.  
  Business logic lives elsewhere (services, utilities, components).

- **Rich domain model**  
  Data and behavior are encapsulated together, typically in classes.
  Methods enforce invariants and control how data evolves.

Frontend codebases tend to gravitate toward anemic models for simplicity, while backend systems often adopt richer models for correctness.

But which one should we pick in modern TypeScript codebases, where FE and BE apps often coexist?

`xndrjs` starts from the observation that both approaches solve real problems, and both introduce real trade-offs.

### Designing a "third" model

The domain model in `xndrjs` starts from a practical tension that many codebases face:

- **Anemic models** are simple and easy to use for moving data across layers, but offer no guarantees and are easily corrupted.

- **Rich domain models** enforce correctness, but often introduce ceremony, indirection, and friction (like writing and maintaining many DTOs and mappers).

`xndrjs` stems from one simple question: is _rich vs anemic_ a real dichotomy, or can we design a model that offers the best of both worlds?

---

### The intrinsic tension

The domain model in `xndrjs` is designed around two practical requirements:

- we want the **simplicity and mobility of anemic data**...
- ...without giving up the **correctness guarantees of rich models**

In real systems, this means:

- data should move freely across layers (infrastructure, domain, orchestration)
- we should avoid unnecessary 1:1 mappers and DTO duplication
- types should be inferred directly from the model **whenever possible**

But also:

- data should not be arbitrarily mutable **anywhere** in our codebase
- invariants should not rely on discipline alone
- the system should resist accidental corruption

This leads to a central design question:

> Can we have an anemic data model that is still correct by construction?

Not “rich” in the object-oriented sense (methods attached to instances), but:

- data-centric
- immutable outside the orchestration and domain layers, by segregating the functions capable of transforming data
- safe to use everywhere

---

### A realistic constraint

The answer is not absolute.

No system can be made completely immune to misuse.

So the question evolves into:

> Can we design a model where doing the wrong thing requires more effort than doing the right thing?

---

### Path of least resistance

This is the guiding principle behind `xndrjs`:

> correctness should be the path of least resistance

Instead of relying on:

- developer discipline
- conventions
- code reviews

the model introduces constraints and primitives such that:

- valid data is easy to create and transform
- invalid data is hard to represent (and impossible to represent _by accident_)
- transformations preserve correctness
- **unsafe patterns require explicit effort**

---

### Design consequences

This leads to a model where:

- data is immutable and validated at boundaries
- representations are trusted once created
- behavior is externalized and explicit
- guarantees are layered, not assumed

And crucially:

> data can flow across layers without friction, but cannot be silently corrupted

`xndrjs` does not aim for theoretical purity. It optimizes for:

- low friction
- high correctness
- gradual adoption

by designing a domain model where:

> simplicity and safety are not in conflict, but engineered to coexist.

Okay, that’s enough high-level talk. Let’s get into the actual details.

---

## 1. Domain as a System

When we say "domain", we often mean a vague mixture of types, validation, business rules, and services.

For `xndrjs`, it is useful to be more explicit. A domain system is made of:

- a set of values
- a set of constraints
- a set of allowed transformations

In a tiny user model, that means:

- valid values: users with an `id`, an `email`, a `displayName`
- constraints: email must be valid, display name cannot be empty
- transformations: rename, verify, deactivate

The point is not the terminology. The point is that these three things should not be hidden in random places.

`xndrjs` gives each one a place.

---

## 2. Values as validated sets

Shapes and primitives define **sets of valid values**.

That sentence sounds formal, but the practical idea is simple:

> `User.create(raw)` is the door through which raw data becomes trusted domain data.

Before creation, we have input:

```txt
unknown
```

After creation, we have a member of the domain:

```txt
unknown -> validate -> user ∈ User
```

For example:

```ts
const user = UserShape.create({
  id: "usr_123",
  email: "ada@example.com",
  displayName: "Ada",
  isVerified: false,
});
```

If the email is invalid, there is no `User`. If the display name is empty, there is no `User`.

Once `user` exists:

- it belongs to a well-defined set
- it is immutable
- it can be safely composed with other operations

This establishes a **closed world assumption** inside the domain:

> inside the domain, invalid users do not exist by accident

This is not magic. Someone can still use `as any`, mutate through unsafe escape hatches, or bypass the model entirely.

But if they follow the normal API, the easiest path is the valid path.

---

## 3. Validation vs representation

Validation is a predicate:

```txt
validate: unknown → Result<T>
```

Representation is a guarantee:

```txt
x ∈ T
```

Validation _determines_ membership.
Representation _encodes_ membership.

In simple words: **validation** is the guy at a government office who verifies your identity. **Representation** is the ID card you receive after that verification.

- The officer answers: _“are you who you claim to be?”_
- The ID card answers: _“this person has already been verified”_

Once you have the ID card, you don’t need to prove your identity again every time.  
The validation already happened, and the representation carries that guarantee forward.

In the same way:

- validation checks whether a value belongs to a set
- representation is the value, now marked as a member of that set

This distinction matters because it avoids re-checking the same thing everywhere.

For example, a function sending an email to a user does not need to know how to validate the email address if it receives a `User` from the domain. It can just `user.email`.

The validation happened at the boundary. The representation carries the result.

---

## 4. Transformations as named transitions

Domain operations are modeled as `capabilities`.

Formally, a capability method looks like a function:

```txt
f: T → T'
```

with the property that:

```txt
x ∈ T ⇒ f(x) ∈ T'
```

In less formal terms:

> if you start from a valid value and call a domain operation, the result must still be valid.

Example:

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

const renamed = User.rename(user, "Ada Lovelace");
const verified = User.verify(renamed);
```

The important part is not that `rename` is a function. The important part is that it can only update the value through `patch`, and `patch` re-enters the shape validator before returning.

So these operations:

- do not "mutate"
- do not produce invalid values
- return a new frozen value
- preserve the shape contract

All state changes are expressed as **validated transitions**.

This is where `xndrjs` moves one step beyond a classic rich OOP model.

In a rich class, invariants usually have to be remembered inside every method:

```ts
class User {
  rename(displayName: string) {
    if (displayName.length === 0) throw new Error("Invalid display name");
    this.displayName = displayName;
  }
}

// or, using a more sophisticated validator
class User {
  setBigObject(bigObject: BigObjectInput) {
    // i.e. using Zod or similiar libraries
    const parsed = BigObjectSchema.parse(bigObject);
    this.bigObject = parsed;
  }
}
```

This works, but the guarantee depends on every method author remembering to validate incoming data.

In `xndrjs`, the operation still has a name (`rename`), but the validation is not something the method has to remember at the end. It is implicit in the only update mechanism the capability receives:

```ts
rename(user, displayName: string) {
  return patch(user, { displayName });
}
```

The method describes the domain transition. The shape validator remains the authority on whether the resulting value is valid.

---

## 5. Guarantees as predicates over sets

Proofs define **refinements** over existing sets:

```txt
P: T → boolean
```

Applied to a value:

```txt
x ∈ T ∧ P(x) ⇒ x ∈ T ∩ P
```

They:

- do not change the value
- add semantic guarantees
- can be composed

That means a `User` and a `VerifiedUser` do not need to be two unrelated data structures.

A `VerifiedUser` can be understood as:

```txt
VerifiedUser = User + proof(isVerified === true)
```

For example:

```ts
const VerifiedUser = domain
  .proof("VerifiedUser", UserShape.validator)
  .refineType((candidate): candidate is typeof candidate & { isVerified: true } => {
    return candidate.isVerified === true;
  });
```

The proof does not invent new data. It states that a stronger predicate now holds.

This gives workflows a precise vocabulary:

- an onboarding screen may accept any `User`
- a billing workflow may require a `VerifiedUser`
- an admin action may require an `ActiveUser`

The value can stay data-like, while the required guarantee becomes explicit.

---

## 6. Composition without ceremony

All domain logic is expressed as composition:

```txt
x ∈ T
→ f₁(x) ∈ T₁
→ f₂(x) ∈ T₂
→ P(x) holds
```

In code, that can remain very ordinary:

```ts
const user = UserShape.create(rawUser);
const renamed = User.rename(user, "Ada Lovelace");
const verified = User.verify(renamed);
const verifiedUser = VerifiedUser.assert(verified);
```

Or, for ergonomics, you can use the `pipe` function:

```ts
import { pipe } from "@xndrjs/domain";

const verifiedUser = pipe(
  UserShape.create(rawUser),
  (u) => User.rename(u, "Ada Lovelace"),
  User.verify,
  VerifiedUser.assert
);
// now TypeScript knows that isVerified is not "just" boolean: it's true.
```

There is no need to wrap every step in a class hierarchy or create DTOs just to move between layers.

The reason this stays predictable is that:

- values are immutable
- transformations re-validate
- predicates are explicit

composition remains:

- predictable
- easy to test
- side-effect free at the value level

The model is algebraic in the practical sense: small operations can be combined because each operation has a clear input, a clear output, and a validation boundary.

---

## 7. Why capabilities use small contracts

A capability bundle can be defined on an arbitrarily small contract:

```ts
const Rename = domain.capabilities<{ displayName: string }>().methods((patch) => ({
  rename(entity, displayName: string) {
    return patch(entity, { displayName });
  },
}));
```

This capability does not care whether the value is a `User`, an `Author`, or a `CustomerProfile`.

It only says:

> give me something with a `displayName`, and I know how to rename it.

At first glance, this may sound dangerously generic. If a function can operate on any compatible object, what tells us that it is really being used on the intended domain shape?

The answer is `attach`.

```ts
const User = Rename.attach(UserShape);
const Author = Rename.attach(AuthorShape);
```

The capability contract is small, but the association with a shape is explicit and intentional.

This gives us two useful properties at the same time:

- the behavior is reusable because it depends only on the fields it needs
- the domain binding is explicit because methods appear only after `attach(shape)`

This is another step away from anemic services.

In an anemic model, a service often receives "some object matching a contract", mutates it or returns a changed copy, and the domain association is mostly conventional:

```ts
renameThing(entity, "Ada Lovelace");
```

But what makes `entity` intentionally part of the `User` domain? What tells the reader that this operation belongs to that shape, and not just to any object with a `displayName`?

With capabilities, the generic contract is only the reusable logic. The public operation is created by attaching that logic to a named shape:

```ts
User.rename(user, "Ada Lovelace");
```

That call carries both pieces of information:

- `rename` only needs a small structural contract
- `User.rename` is intentionally part of the `User` domain API

So capabilities are not just reusable functions. They are reusable functions that must be bound to a domain shape before they become part of the model.

---

## 8. Orthogonality

The model separates four concerns:

- validation → set membership
- representation → trusted values
- capabilities → transformations
- guarantees → predicates

These concerns are independent, but they are not disconnected.

Each has a job:

- `shape` answers: "what data is valid?"
- `create` answers: "how does unknown input enter the domain?"
- `capabilities` answer: "which transitions are allowed?"
- `patch` answers: "how do transitions preserve validation?"
- `proof` answers: "which stronger guarantees does this workflow require?"

Keeping these jobs separate prevents two common failure modes:

- rich models where every class method must manually remember every invariant
- anemic models where behavior lives in services that are only loosely connected to the domain data they transform

`xndrjs` keeps the data plain and mobile, but makes the allowed operations explicit and attached to the domain kit.

---

## 9. Boundary model

All external input starts as:

```txt
unknown
```

It becomes domain data only after crossing a validation boundary:

```txt
unknown -> validated -> value ∈ domain
```

After that, the domain value can move through the application as data.

This is especially useful in TypeScript applications that span frontend and backend concerns:

- forms produce unknown or partially trusted input
- APIs return JSON
- state managers prefer serializable objects
- UI components should not carry domain validation logic

`xndrjs` lets these layers remain simple while preserving a hard boundary around domain creation and domain transitions.

The value is data-like where mobility matters, and domain-like where correctness matters.

---

## 10. Design principle

The system aims for:

```txt
invalid states are unrepresentable by default
```

Not by types alone, but by combining:

- construction constraints
- immutable representations
- validated patch transitions
- explicit capability attachment
- stronger proofs when a workflow needs them

This is the key practical idea:

> correctness is not a convention added around the model; it is built into the way values enter and evolve.

That does not eliminate every possible misuse. TypeScript cannot prevent a determined developer from escaping the model.

But it changes the default economics of the codebase:

- creating valid data is straightforward
- naming a domain operation is straightforward
- preserving validation during transitions is automatic
- bypassing the model becomes visible and intentional

---

## Final recap

`xndrjs` turns domain modeling into a small, composable algebra:

- values form validated sets
- validation defines membership
- representation carries trust
- capabilities name allowed transformations
- `patch` makes transitions re-enter validation
- `attach` binds reusable behavior to an intentional shape
- proofs refine values when workflows require stronger guarantees

This is neither a classic rich model nor a plain anemic model.

It is a data-first domain model where correctness is a structural property of the system:

- independent
- composable
- non-overlapping
- explicit by construction

Simplicity and safety are not treated as opposite goals. They are engineered to reinforce each other.
