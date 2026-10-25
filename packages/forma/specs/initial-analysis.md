# Forma — Capability-Oriented Architecture

## 0. Vision

**Forma** (`@xndrjs/forma`, working name) is an experimental TypeScript architecture toolkit.

Its purpose is to organize applications around **isolated architectural boundaries, stable business capabilities, explicit contracts, and evolving realizations**.

Forma does not replace Clean Architecture. It provides primitives for implementing rigorous architectural separation without imposing fixed implementation layers, mandatory passthrough use cases, or rigid physical structures.

**Guiding principles:**

> Architecture should constrain relationships, not prescribe implementations.

> AI should accelerate software development without becoming a prerequisite for software maintenance.

> Software built with AI should remain understandable, verifiable, and maintainable without AI.

The ultimate goal is software that humans can navigate, understand, modify, and maintain independently.

## 1. Motivation

AI-assisted development can amplify several problems:

- **AI bottleneck:** code is produced faster than humans can review and understand it.
- **AI amnesia:** developers recognize code during review without developing the mental map needed to locate and modify it later.
- **AI shotgun:** conceptual changes require modifying numerous distributed representations.
- **AI lock-in:** developers delegate even trivial changes to AI because they lack confidence navigating the implementation.

Forma explores architectural mechanisms to mitigate these problems.

A desired property is **semantic change locality**:

> A conceptual change should have an understandable, predictable, and proportionate implementation impact.

## 2. Conceptual model

Introduce four concepts progressively.

### 2.1 Boundary — Where capabilities belong

A **Boundary** defines an isolated architectural space.

```ts
const Catalog = boundary("catalog");
```

A boundary:

- Owns its capability definitions and their contracts.
- Establishes a namespace for capability identities.
- Is isolated from other boundaries.
- Does not directly import other boundaries, including their TypeScript types.

A boundary is **not necessarily a DDD Bounded Context**, a package, or a directory. It is a more general architectural isolation mechanism.

**Capabilities interact within boundaries. Composition connects across boundaries.**

### 2.2 Capability — What the system can do

A capability identifies a meaningful business behavior within a boundary.

```ts
const LoadProduct = Catalog.capability<ProductId, Product, ProductNotFound>("loadProduct");
```

Its identity derives from the boundary and local name:

```text
catalog.loadProduct
```

This identity is independent of the capability's realization.

Examples include `CancelOrder`, `CalculateDiscount`, `ApproveInvoice`, and `ResolvePagePath`.

Not every function, loader, port, or adapter is a capability.

### 2.3 Contract — What the capability promises

Every capability owns a TypeScript contract describing:

- Input
- Successful outcome
- Expected failures

A realization must satisfy this contract.

The exact runtime representation of success and failure is still undecided. Explore typed `Result` values and alternative approaches without prematurely committing to one.

### 2.4 Realization — How behavior is fulfilled

A realization is an ordinary TypeScript implementation of a capability.

It may:

- Execute domain or application logic.
- Delegate to another capability.
- Orchestrate multiple capabilities.
- Use technical dependencies through ports.
- Access infrastructure through implementations supplied by composition.

**Realization does not mean infrastructure implementation.**

A realization may be simple or complex and may evolve without changing the capability's identity.

## 3. Progressive navigation

A developer should be able to start from a recognizable business behavior and progressively explore its implementation.

```text
Boundary: Catalog
  └── Capability: LoadProduct
        ├── Contract
        └── Realization
              ├── Business logic
              ├── Other local capabilities
              └── Technical dependencies
```

Dependencies on other capabilities can be explored recursively.

This is a **conceptual navigation model**, not a mandatory physical hierarchy.

Avoid introducing a separate ontology of implementation details. Concrete TypeScript code remains the implementation.

## 4. Dynamic seams

Traditional Clean Architecture often uses fixed seams:

```text
Entry point → Use case → Port → Adapter
```

Even passthrough use cases provide a place where future orchestration can be introduced.

Forma separates a behavior's **identity from its realization**, enabling seams to emerge when needed.

Initially:

```text
GetProduct → ProductReader.load
```

Later:

```text
GetProduct
  ├── ProductReader.load
  ├── CheckVisibility
  └── EnrichProduct
```

The capability identity and its consumers remain stable as long as the contract is compatible.

This is **progressive realization**, not the removal of architectural rigor.

Conceptual separation does not require physical separation: definitions and realizations can be co-located when appropriate.

## 5. Boundary isolation and composition

Boundary isolation is a core invariant, not an optional convention.

Consider two boundaries:

```ts
const Catalog = boundary("catalog");
const Checkout = boundary("checkout");
```

Each independently defines its capabilities and contracts.

**Neither boundary can import the other's capability definitions or types.**

If Checkout needs product information, it expresses that requirement using a contract it owns.

Catalog independently exposes a capability capable of supplying the relevant information.

Only the composition layer knows both boundaries:

```text
Catalog                 Checkout
   │                       │
   │   No direct imports   │
   │                       │
   └───── Composition ─────┘
                │
       Contract adaptation
          when necessary
```

Composition must connect compatible contracts or introduce an explicit adapter when translation is necessary.

This ensures that neither boundary must adopt another boundary's model.

Boundary isolation and cross-boundary contract compatibility must be verifiable, not merely documented intentions.

The enforcement mechanism remains an open design question.

## 6. Core API

Explore four primitives.

### `boundary()`

Creates an isolated capability space.

```ts
const Orders = boundary("orders");
```

### `boundary.capability()`

Defines a capability owned by its boundary.

```ts
const CancelOrder = Orders.capability<CancelOrderInput, CancelledOrder, CancellationError>(
  "cancel"
);
```

Capability identity derives from boundary identity and local capability name.

### `provide()`

Associates a capability with its realization.

Use a single conceptual convention:

```ts
provide(Capability, factory);
```

The factory receives dependencies and returns a function satisfying the capability's contract.

Dependencies may be local capabilities or ordinary technical ports.

Do not require an orchestration DSL.

### `compose()`

Builds the executable application by:

- Associating capabilities with realizations.
- Resolving required dependencies.
- Connecting isolated boundaries.
- Applying contract adapters when needed.
- Verifying dependency exhaustiveness and architectural constraints.

**`compose()` is exclusively the composition-root operation.**

Orchestration within realizations remains ordinary TypeScript. Helpers such as `serial`, `parallel`, and `retry` may be explored later as optional conveniences.

## 7. Practical examples

### Example A — Trivial capability

```ts
// catalog/capabilities.ts
export const Catalog = boundary("catalog");

export const GetProduct = Catalog.capability<ProductId, Product, ProductNotFound>("getProduct");
```

A realization may delegate directly to a technical port:

```ts
// catalog/realizations.ts
export const GetProductImpl = provide(GetProduct, ({ productReader }) => productReader.load);
```

No mandatory passthrough use-case function.

The technical port belongs to the boundary's own contracts. Its infrastructure implementation is supplied externally.

### Example B — Evolving realization

Later, products must be checked for visibility.

```ts
const GetProductImpl = provide(GetProduct, ({ productReader }) => async (id) => {
  const result = await productReader.load(id);

  if (!result.ok) return result;

  if (!isVisible(result.value)) {
    return err(ProductUnavailable);
  }

  return result;
});
```

The capability retains its identity.

The contract must already include `ProductUnavailable`, or must be deliberately evolved.

### Example C — Cross-boundary integration

Catalog owns its product-loading capability.

Checkout independently owns a contract describing the product information needed for checkout.

Neither imports the other's types.

Composition connects them, potentially using a translation adapter:

```ts
// composition/app.ts — conceptual API
const app = compose({
  boundaries: [Catalog, Checkout],
  providers: [GetProductImpl, CheckoutImpl],
  connections: [adapt(CatalogGetProduct, CheckoutProductRequirement, mapProduct)],
});
```

This is illustrative syntax, not a finalized API.

The critical invariant is that cross-boundary knowledge and translation belong to composition, not to the boundaries themselves.

Explore how much of this wiring can be inferred safely without weakening isolation.

## 8. Required properties

**Stable identity:** capability identity does not depend on its realization.

**Contract compatibility:** realizations satisfy their capability contracts.

**Boundary ownership:** capability contracts belong to their declaring boundary.

**Boundary isolation:** boundaries never directly import one another, including type-only imports.

**Composition ownership:** cross-boundary integration and translation happen in composition.

**Dependency exhaustiveness:** every dependency required by the selected application entry points must be satisfied.

**Architectural correctness:** illegal dependencies must be detected through mechanical guarantees wherever possible.

**Progressive realization:** delegation can evolve into orchestration without unnecessary consumer changes.

**Minimal boilerplate:** simple capabilities remain inexpensive to implement.

**Human navigability:** capability identities provide recognizable entry points into the application.

## 9. Execution semantics

Capability contracts distinguish successful outcomes from expected failures.

Explore typed results:

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

Do not commit prematurely to a particular representation.

For sequential operations, expected failure should ordinarily short-circuit subsequent execution.

But short-circuiting does not imply rollback.

Example:

```text
CancelOrder
  ├── PersistCancellation
  └── SendNotification
```

If persistence fails, notification must not execute.

If notification fails after persistence succeeds, the partial side effect must be accounted for explicitly.

Use ordinary TypeScript initially.

## 10. Open questions

Explore through examples rather than inventing abstractions prematurely.

- Can TypeScript generics and currying guarantee composition exhaustiveness without code generation?
- How should capability dependencies and ordinary technical dependencies be represented?
- How can boundary isolation be enforced, including type-only imports?
- How are cross-boundary contracts matched and adapted?
- Can composition infer compatible connections without creating ambiguity or hidden coupling?
- How should scope, lifecycle, and disposal work?
- Can capabilities represent synchronous, asynchronous, streaming, and stateful behaviors?
- How can code navigation be supported without maintaining a separate semantic registry?
- What can be reused from Effect Services/Layers and existing IoC approaches without adopting their full runtime models?
- How might Forma integrate with `@xndrjs/domain` while preserving distinct responsibilities?

Do not assume these questions require additional core primitives.

## 11. Working method — Telescope

Develop the model progressively.

### L0 — Conceptual foundation

Explain each concept before introducing the next.

For every concept, establish:

- Why it exists.
- What problem it solves.
- What expressive power it introduces.
- How it interacts with previously introduced concepts.

### L1 — Concrete examples

Implement progressively more challenging scenarios.

For each, compare ordinary TypeScript/Clean Architecture against Forma.

Evaluate both benefits and additional complexity.

### L2 — Counterexamples

Actively look for cases where the model becomes awkward, ambiguous, verbose, or insufficient.

Do not defend an abstraction simply because it already exists in the design.

### L3 — API design

Refine type inference, contracts, dependency declaration, boundary isolation, composition, and DX.

### L4 — Proof of concept

Build a minimal tested TypeScript implementation.

Avoid expanding scope beyond the concepts justified by the examples.

### L5 — Validation

Test at least:

1. Trivial business capability backed by a technical port.
2. Delegation to another capability in the same boundary.
3. Evolution from delegation to orchestration.
4. Different realizations for server and tests.
5. Cross-boundary integration with compatible contracts.
6. Cross-boundary integration requiring translation.
7. Detection of illegal imports, including type-only imports.
8. Missing and incompatible dependencies.
9. Sequential operations with partial side effects.
10. Stateful or streaming behavior.

## 12. Non-goals

Forma must not become:

- A replacement for React or other application runtimes.
- A universal domain-modeling language.
- A mandatory orchestration DSL.
- An opaque service locator.
- A rigid directory hierarchy.
- A system where every technical operation becomes a capability.
- A second, manually synchronized description of an application.

Boundary isolation must not depend on trusting the AI or on developers manually remembering the rules.

## 13. First deliverable

Produce:

1. A concise conceptual model of Boundary, Capability, Contract, and Realization.
2. A first TypeScript API proposal.
3. Three concrete examples, including cross-boundary composition.
4. Counterexamples and identified weaknesses.
5. A minimal, tested proof of concept.

Keep decisions reversible until the model has survived realistic use cases.

**Core hypothesis:**

> Stable business capabilities, isolated boundaries, and independently evolving realizations enable dynamic architectural seams without sacrificing rigor.

**Success criterion:**

A developer can start from a recognizable business capability, understand its contract, navigate its realization, and modify its behavior without reconstructing the entire codebase or relying on AI.
