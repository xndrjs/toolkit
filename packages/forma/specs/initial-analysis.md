# Forma — Intent-Oriented Architecture

## 0. Vision

**Forma** (`@xndrjs/forma`, working name) is an experimental TypeScript architecture toolkit.

Its purpose is to organize applications around **isolated architectural boundaries, stable business intents, explicit contracts, and evolving realizations**.

Forma does not replace Clean Architecture. It provides primitives for implementing rigorous architectural separation without imposing fixed implementation layers, mandatory passthrough use cases, or rigid physical structures.

**Guiding principles:**

> Architecture should constrain relationships, not prescribe implementations.

> AI should accelerate software development without becoming a prerequisite for software maintenance.

> Software built with AI should remain understandable, verifiable, and maintainable without AI.

The ultimate goal is software that humans can navigate, understand, modify, and maintain independently.

**Core principle:**

> Intent defines what we want to achieve. Provider defines how and with what lifecycle. Composition connects the implementations and defines the application's public surface.

The aim is to preserve strict architectural boundaries while making application wiring, lifecycle, and public behavior easy for humans to understand.

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

Introduce concepts progressively. Each earns its place through a distinct responsibility.

### 2.1 Boundary — Where intents belong

A **Boundary** defines an isolated architectural space.

```ts
const Orders = boundary("orders");
```

A boundary:

- Owns its intent definitions and their contracts.
- Establishes a namespace for intent identities.
- Is isolated from other boundaries.
- Does not directly import other boundaries, including their TypeScript types.

A boundary is **not necessarily a DDD Bounded Context**, a package, or a directory. It is a more general architectural isolation mechanism.

**Intents interact within boundaries. Composition connects across boundaries.**

### 2.2 Intent — What we want to achieve

An **Intent** is a declared intention: a meaningful business outcome named within a boundary. It is not an implementation.

```ts
const CancelOrder = Orders.intent<OrderId, CancelledOrder, CancelOrderError>("cancel");
```

Its semantic name derives from the boundary and local identifier:

```text
orders.cancel
```

An internal nominal identity (for example a `unique symbol`) distinguishes it from other Intents. Two Intents with structurally compatible contracts are **not** automatically interchangeable. That identity mechanism stays an implementation detail — not a public `token()` primitive.

**Boundary branding (compile-time `using` check).** Each Intent should also carry a TypeScript brand (or phantom type parameter) identifying its owning boundary — for example `Intent<"orders", Input, Success, Error>`. That brand is distinct from nominal Intent identity:

- **Boundary brand** answers: “does this Intent belong to the same architectural space?”
- **Nominal identity** answers: “is this the same Intent?” (structurally compatible contracts ≠ same Intent)

`provide.using(...)` should accept only Intents branded with the **same** boundary as the Intent being realized. Putting a cross-boundary Intent in `using` must be a TypeScript error. Cross-boundary wiring remains exclusive to composition (`bindings`), which must still accept Intents from different boundaries.

This check covers the `using` API surface. It does **not** by itself enforce the full isolation invariant (no cross-boundary imports, including type-only). Lint or dependency rules remain necessary for import-graph enforcement. Branding is a type-level constraint, not a runtime guarantee.

**An Intent does not declare implementation dependencies.** Its contract defines only:

- Input
- Success
- Expected failure

Dependencies belong exclusively to the realization: different realizations of the same Intent may need completely different dependencies. That separation is what makes Forma's dynamic seams possible.

Examples include `CancelOrder`, `CalculateDiscount`, `ApproveInvoice`, and `ResolvePagePath`.

Not every function, loader, port, or adapter is an Intent.

**Naming note:** Forma uses **Intent**, not "Capability", so the vocabulary does not collide with **capabilities** in `@xndrjs/domain` (domain-side transformations over trusted values). Domain capabilities remain a modeling concern; Forma intents remain architectural intentions that may call domain logic from a realization.

**Admission (settled):** An Intent may live in a business or infrastructure boundary when stable identity and composition binding matter (e.g. `postgres.selectOrder`). Ordinary helpers and one-off loaders used only inside a `with` factory need not become Intents.

**Contract Error (settled):** The `Error` type parameter is expected domain failures only. Unexpected technical failures stay outside the contract (e.g. throw / untyped failure paths), not every IO exception.

### 2.3 Contract — What the intent promises

Every Intent owns a TypeScript contract describing input, successful outcome, and expected failures.

A realization must satisfy this contract.

**PoC convention (reversible):** use a discriminated `Result<T, E>` for success vs expected contract failures. Unexpected technical failures remain outside that representation. Revisit if examples demand a different shape.

### 2.4 Realization and Provider — How it is achieved

A **realization** is ordinary TypeScript that fulfills an Intent's contract.

It may execute domain or application logic, delegate to another Intent, orchestrate multiple Intents, or use technical mechanisms through ordinary closures and factories.

**Realization does not mean infrastructure implementation.** It may be simple or complex and may evolve without changing the Intent's identity. Realization is the narrative “how”; it is not a separate public type beside Provider.

A **provider** is the registrable API entity: it associates an Intent with a realization and declares any **Intent** dependencies required to construct it (`using`). Providers declare requirements without choosing which external providers satisfy them — composition decides that.

**Lifecycle belongs to the provider, not the Intent.** The same Intent may have realizations with different lifetime requirements (see §6).

Forma is **not** a general-purpose IoC container. Do not introduce IoC tokens for arbitrary technical dependencies.

### 2.5 Composition — How the pieces connect

A **composition** wires providers, defines what consumers may call, and manages when realizations are materialized.

Keep three responsibilities conceptually distinct:

1. Register providers and resolve dependencies and cross-boundary bindings.
2. Define the public surface available to consumers.
3. Manage lazy materialization and provider lifecycles.

Composition constructs and validates the dependency graph. Execution happens later through an execution context (see §7).

## 3. Progressive navigation

A developer should be able to start from a recognizable business behavior and progressively explore its implementation.

```text
Boundary: Orders
  └── Intent: CancelOrder
        ├── Contract
        └── Provider / Realization
              ├── Lifecycle (default | perContext)
              ├── Business logic
              ├── Other intents (via using)
              └── Technical mechanisms (ordinary TypeScript)
```

Dependencies on other Intents can be explored recursively through composition resolution.

This is a **conceptual navigation model**, not a mandatory physical hierarchy.

Avoid introducing a separate ontology of implementation details. Concrete TypeScript code remains the implementation.

## 4. Dynamic seams

Traditional Clean Architecture often uses fixed seams:

```text
Entry point → Use case → Port → Adapter
```

Even passthrough use cases provide a place where future orchestration can be introduced.

Forma separates a behavior's **identity from its realization**, enabling seams to emerge when needed.

Initially a realization may delegate directly. Later it may orchestrate several steps. The Intent identity and compatible consumers remain stable as long as the contract is compatible.

This is **progressive realization**, not the removal of architectural rigor.

Conceptual separation does not require physical separation: definitions and realizations can be co-located when appropriate.

## 5. Canonical API

Public entry points, organized hierarchically. Earlier standalone `provide()` / `adapt()` proposals and compositions without `surface` are superseded.

Preserve this hierarchy:

```ts
boundary(id)
  .intent<Input, Success, Error>(id)
  .provide.perContext() // optional lifecycle modifier
  .using(dependencies) // optional
  .with(factory);

const root = compose({ surface, providers, bindings });
root.createExecutionContext();
```

`.perContext()` is an optional provider lifecycle modifier. `createExecutionContext()` opens a bounded execution lifetime over a composition. Do not introduce generic IoC tokens, a service locator, an orchestration DSL, or additional public composition primitives without demonstrated necessity.

### Why each primitive exists

| Primitive           | Responsibility                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boundary(id)`      | Create an isolated architectural space and namespace for Intent identities.                                                                                                                                 |
| `boundary.intent()` | Declare an Intent and its contract — the desired outcome, with no implementation dependencies.                                                                                                              |
| `intent.provide`    | Attach a realization; optionally declare lifecycle and Intent dependencies, then supply the factory.                                                                                                        |
| `compose()`         | (1) Register providers and resolve dependencies/bindings; (2) define the public API via `surface`; (3) manage lazy materialization and lifecycles. Keep these three responsibilities conceptually distinct. |

`provide` is accessed **through the Intent**, not as a top-level function.

`using()` is optional when a realization does not require other Intents. `.perContext()` is optional; default lifetime is composition-root shared.

### Provider shape

```ts
const CancelOrderProvider = CancelOrder.provide
  .using({ find: FindOrder })
  .with(({ find }) => async (input) => {
    // Ordinary TypeScript orchestration
  });
```

`using()` identifies required Intents and their local names. Dependency contracts must be inferred and type-checked without duplicating them. Via boundary branding (§2.2), `using` must reject Intents from other boundaries at compile time; same-boundary Intent dependencies remain allowed.

`with()` receives the resolved dependencies and returns a function satisfying the Intent contract.

Without Intent dependencies:

```ts
const IsValidProvider = IsValid.provide.with(() => (input) => {
  /* ... */
});
```

Keep a single factory convention. Do not require an orchestration DSL. Helpers such as `serial`, `parallel`, and `retry` may be explored later as optional conveniences.

### Composition shape

```ts
const appRoot = compose({
  surface: {
    getOrder: GetOrderProvider,
  },

  providers: [SelectOrderProvider],

  bindings: [[FindOrder, SelectOrder]],
});
```

`surface` values are registered automatically. Internal providers go only in `providers`. Do not list the same Intent in both.

#### `surface`

Defines the public API of the composition.

- Keys are public aliases, inferred by TypeScript.
- Values are providers.
- Providers listed in `surface` are automatically registered.
- They must **not** be repeated in `providers`.

#### `providers`

Registers providers available for internal dependency resolution.

They do not become publicly accessible merely by being registered.

#### `bindings`

Explicitly connects different Intent identities.

```ts
[FindOrder, SelectOrder];
```

means a request for `FindOrder` is fulfilled by the provider realizing `SelectOrder`.

**Implicit binding by identity** remains when a provider requires an Intent and another provider realizes that **exact** Intent.

**Explicit binding** is required for different identities, even when contracts are structurally compatible.

Do **not** automatically match Intents on structural similarity alone.

If contracts require translation, register an ordinary **adapter provider** (optionally from a helper such as `adapt(Satisfier, map)` that **returns a provider**) and bind to that provider’s Intent. Do **not** introduce a dedicated composition-level `adapt()` keyword or magic tuple.

Bindings are scoped to a composition, not to global process state.

### Public API and encapsulation

The composition makes callable only aliases declared in `surface`:

```ts
const ctx = appRoot.createExecutionContext();

await ctx.getOrder("123"); // Valid

ctx.findOrder; // TypeScript error
ctx.selectOrder; // TypeScript error
```

Internal providers remain private implementation details.

A public `get(Intent)` API that bypasses `surface` is **not** required. Internal resolution may use an equivalent mechanism, but must not compromise encapsulation.

Duplicate registrations of the same Intent must produce an **error**, not a silent override. This includes registering the same Intent in both `surface` and `providers`.

### Type-safety goal relative to `surface`

Where feasible, composition should be **typesafe with respect to `surface`**: TypeScript should reject incomplete or inconsistent `providers` and `bindings` needed to support the public aliases.

`using(...)` is the **sole source of truth** for Intent dependencies. There is no separate dependency-declaration API. A provider's type-level requirements are exactly the Intents named in its `using` (empty when `using` is omitted).

A practical compile-time target for a closed, executable composition: after rewriting requirements through `bindings`, every Intent required by registered providers (those in `surface` and `providers`) must be satisfied by a registered provider — without inventing a second dependency channel. Flat set inclusion over direct `using` deps is enough; transitive depth is covered once every provider in the graph declares its own direct deps.

**PoC bar (settled):** for a closed, executable composition, TypeScript must reject missing providers needed by `surface` after binding rewrite (happy-path exhaustiveness). Duplicate/ambiguous cases may start as runtime errors if inference cannot express them yet. Prefer compile-time checks; do not claim broader static guarantees until type tests demonstrate them.

## 6. Provider lifecycle

Lifecycle requirements belong to the **provider**, not the Intent.

```ts
const LoadOrderProvider = LoadOrder.provide.perContext().with(() => {
  const loader = new DataLoader(batchLoadOrders);

  return (id) => loader.load(id);
});
```

Proposed semantics:

- **Default:** provider instance shared by the composition root.
- **`.perContext()`:** provider instance materialized separately for each execution context.
- Both are **lazy** and cached within their respective lifetimes.

Prefer `.perContext()` over generic configuration such as `.scope("context")` for now.

Do not introduce additional scopes until concrete use cases justify them.

A provider shared by the composition must not capture a context-lifetime dependency. Investigate whether TypeScript can detect such invalid dependency relationships statically.

Allow future opt-out for providers that require eager initialization, but do not design that API prematurely.

## 7. Lazy composition and execution contexts

### Lazy composition

**Composition is lazy by default.**

```ts
const appRoot = compose({
  /* ... */
});
```

constructs and validates the dependency graph without eagerly executing provider factories.

Realizations are materialized when first needed. Resolved instances are cached according to their lifecycle.

**PoC (settled):** concurrent first accesses to the same provider within the same lifetime must share **one** materialization (single factory run; no duplicate instances from a race).

Do not assume JavaScript `Proxy` is required. Choose the simplest implementation that preserves the intended behavior.

### Execution contexts

Composition and materialization are separate operations.

```ts
const appRoot = compose({
  surface: {
    getOrder: GetOrderProvider,
  },
  providers: [SelectOrderProvider],
  bindings: [[FindOrder, SelectOrder]],
});

const ctx = appRoot.createExecutionContext();

try {
  const result = await ctx.getOrder("123");
} finally {
  await ctx.dispose();
}
```

`createExecutionContext()` creates an isolated execution context that:

- Reuses composition-lifetime instances.
- Materializes context-lifetime instances lazily.
- Reuses context-lifetime instances within that execution context.
- Does not share context-lifetime instances across execution contexts.
- Releases owned resources when disposed.

Composition-lifetime resources need an eventual disposal mechanism on the composition root (e.g. optional `root.dispose()`). **PoC (settled):** support `ctx.dispose()` fully; provide a composition-root dispose path even if initially thin — cover it with **tests and a demo app**, not only docs.

An execution context is a **bounded execution lifetime** (HTTP request, job run, CLI invocation, test case, …) — not tied to HTTP.

## 8. Dependency resolution

Composition resolves dependencies recursively. Provider registration order must not affect resolution.

Given:

```ts
const GetOrderProvider = GetOrder.provide
  .perContext()
  .using({ find: FindOrder })
  .with(
    ({ find }) =>
      async (id) =>
        find(id)
  );
```

and binding `[FindOrder, SelectOrder]`, resolution must:

1. Locate the provider for `GetOrder`.
2. Discover its requirement for `FindOrder`.
3. Resolve `FindOrder` through the binding to `SelectOrder`.
4. Locate and materialize `SelectOrderProvider`.
5. Supply the resulting operation to `GetOrderProvider`.

Missing, ambiguous, incompatible, duplicate, or invalidly scoped dependencies must be detected.

Prefer compile-time guarantees when feasible, supplemented by runtime validation. Explore type-level inference and currying before code generation. Do not claim static guarantees until type tests demonstrate them. See also the type-safety goal relative to `surface` in §5 (`using` as sole dependency source).

## 9. Boundary isolation

Boundary isolation is a core invariant, not an optional convention.

Neither boundary can import another's Intent definitions or types. If one boundary needs information another can supply, each expresses that need with contracts it owns. Only composition knows both sides and connects them — via implicit identity match or explicit binding.

```text
Orders                  Postgres
   │                       │
   │   No direct imports   │
   │                       │
   └───── Composition ─────┘
                │
     surface + providers
     + bindings
```

Cross-boundary knowledge and wiring belong to composition, not to providers.

**Type-level help vs full enforcement.** Boundary-branded Intents make `using(...)` refuse cross-boundary dependencies in TypeScript (§2.2). That is a deliberate, local compile-time guard aligned with “providers declare only local Intent requirements.” It does not replace mechanical enforcement of the import graph (including type-only imports). Composition and `bindings` must remain able to reference Intents from multiple boundaries.

**PoC (settled):** no lint/dependency-cruiser for cross-boundary imports yet — rely on `using` branding plus example/demo discipline. Mechanical import-graph enforcement is a later step.

**Contract types stay local.** Each boundary owns (or duplicates) the TypeScript types used in its Intent contracts. Do **not** share a cross-boundary type kernel for ownership models. Illustrative examples that reuse one `Order` symbol across Orders and Postgres are shorthand only; a real layout duplicates those types per boundary.

**Binding compatibility (settled):** A binding `[Required, Satisfier]` is valid when the two Intent contracts are **structurally equivalent** (input / success / expected errors). If they are not, introduce an ordinary **adapter provider** (helper may return a provider) so the bound satisfier matches structurally. Not a `compose`-level `adapt()` primitive unless later justified.

**Infrastructure as Intent (settled preference):** Prefer describing replaceable infrastructure through Intents in infrastructure boundaries (bound in composition). Keeping infra only as a private closure inside `with` remains legal but is a narrow, non-scaling case — not the default teaching path.

## 10. Practical examples

Illustrative pseudocode — not a finalized TypeScript implementation.

### Example A — Single surface provider without dependencies

```ts
const Health = boundary("health");
const Ping = Health.intent<void, "pong", never>("ping");

const PingProvider = Ping.provide.with(() => () => "pong");

const appRoot = compose({
  surface: { ping: PingProvider },
});

const ctx = appRoot.createExecutionContext();
await ctx.ping();
```

### Example B — Surface provider depending on private providers

```ts
const Orders = boundary("orders");
const Postgres = boundary("postgres");

const FindOrder = Orders.intent<OrderId, Order, FindOrderError>("find");
const GetOrder = Orders.intent<OrderId, Order, FindOrderError>("get");
const SelectOrder = Postgres.intent<OrderId, Order, FindOrderError>("selectOrder");

const SelectOrderProvider = SelectOrder.provide.with(() => async (id) => {
  // PostgreSQL implementation.
});

const GetOrderProvider = GetOrder.provide
  .perContext()
  .using({ find: FindOrder })
  .with(
    ({ find }) =>
      async (id) =>
        find(id)
  );

const appRoot = compose({
  surface: {
    getOrder: GetOrderProvider,
  },
  providers: [SelectOrderProvider],
  bindings: [[FindOrder, SelectOrder]],
});

const ctx = appRoot.createExecutionContext();

try {
  await ctx.getOrder("123"); // Valid
  // ctx.findOrder / ctx.selectOrder → TypeScript errors
} finally {
  await ctx.dispose();
}
```

`GetOrder` is public. `SelectOrder` is private. There is no `FindOrder` provider in this composition: requests for `FindOrder` are fulfilled through the explicit binding to `SelectOrder`.

`GetOrderProvider` remains unaware of PostgreSQL.

**Counterexample:** registering both a `FindOrderProvider` and `bindings: [[FindOrder, SelectOrder]]` must be detected as ambiguous or duplicate satisfaction of `FindOrder`, not resolved silently.

This example intentionally does not yet model a full cancel/persist workflow; extend it when testing complete side-effect chains.

### Example C — Context-scoped materialization

```ts
const LoadOrderProvider = LoadOrder.provide.perContext().with(() => {
  const loader = new DataLoader(batchLoadOrders);
  return (id) => loader.load(id);
});
```

Each `createExecutionContext()` gets its own loader instance, created lazily on first use, reused within that execution context, and released on `dispose()`.

### Example D — Evolving realization

A realization can grow from direct delegation into orchestration without changing Intent identity, as long as the contract remains compatible — or is deliberately evolved.

## 11. Exhaustiveness and composable compositions

### Exhaustiveness

Composition should detect:

- Missing providers.
- Missing bindings.
- Incompatible contracts.
- Ambiguous resolutions.
- Duplicate registrations of the same Intent (including `surface` ∩ `providers`).
- Circular dependencies that cannot be safely resolved.
- Invalid lifecycle relationships (for example composition-lifetime capturing context-lifetime).

### Partial compositions

A composition may be partial rather than the final application. Future work may allow independently defined compositions to be combined.

**PoC scope (settled):** only **closed, executable** compositions. Partial composition and merge stay documented as future work — do not implement or design the merge API in the first PoC.

Preserve:

- Bindings belong to a composition, not global process state.
- Different compositions may bind the same Intent differently.
- Partial compositions may retain unresolved dependencies.
- Exhaustiveness is required when a composition becomes executable.
- Composition aggregation must eventually define provider ownership, lifetime, and conflict resolution.

Composition closure and aggregation remain open design problems.

## 12. Architectural invariants

1. **Intent independence:** Intent definitions do not depend on their realizations.
2. **Realization independence:** providers declare requirements without choosing which external providers satisfy them.
3. **Composition ownership:** cross-boundary wiring is performed by composition, not by providers.
4. **Boundary isolation:** boundaries do not directly depend on one another, including through type-only imports.
5. **Stable identity:** provider replacement does not change Intent identity.
6. **No hidden wiring:** different Intent identities require explicit binding.
7. **Explicit public surface:** only `surface` aliases are callable by consumers.
8. **Lazy by default:** composition validates the graph; factories run on first need within lifecycle.
9. **Lifecycle on provider:** lifetime is a realization concern, not an Intent concern.
10. **Minimal conceptual surface:** avoid adding primitives when existing ones suffice.

Also retain:

- **Contract compatibility:** realizations satisfy their Intent contracts.
- **Boundary ownership:** Intent contracts belong to their declaring boundary.
- **Progressive realization:** delegation can evolve into orchestration without unnecessary consumer changes.
- **Minimal boilerplate:** simple Intents remain inexpensive to implement.
- **Human navigability:** Intent identities provide recognizable entry points into the application.

## 13. Execution semantics

Intent contracts distinguish successful outcomes from expected failures.

Explore typed results:

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

Do not commit prematurely to a particular representation.

For sequential operations, expected failure should ordinarily short-circuit subsequent execution. Short-circuiting does not imply rollback.

Example:

```text
CancelOrder
  ├── PersistCancellation
  └── SendNotification
```

If persistence fails, notification must not execute. If notification fails after persistence succeeds, the partial side effect must be accounted for explicitly.

Use ordinary TypeScript initially.

## 14. Open questions

Explore through examples rather than inventing abstractions prematurely.

- Beyond the PoC missing-provider compile check, how far can generics push duplicate/ambiguous binding detection without code generation?
- Can TypeScript detect invalid lifecycle edges (composition-lifetime provider depending on context-lifetime provider) statically?
- How should composition-root disposal work alongside `ctx.dispose()`?
- How should partial composition closure and aggregation work (merge API deferred)?
- How can full boundary isolation be enforced on the import graph, including type-only imports? (PoC: branding + discipline only; mechanical enforcement still open.)
- What DX should the optional `adapt(Satisfier, map) → Provider` helper have (name, map shape) once examples need translation?
- Can Intents represent synchronous, asynchronous, streaming, and stateful behaviors?
- How can code navigation be supported without maintaining a separate semantic registry?
- What can be reused from Effect Services/Layers and existing IoC approaches without adopting their full runtime models or becoming a general IoC container?
- How might Forma integrate with `@xndrjs/domain` (including domain capabilities) while preserving distinct responsibilities — Forma intents vs domain capabilities?

Do not assume these questions require additional core primitives. Do not introduce new public primitives or change established API responsibilities without identifying the concrete limitation that requires doing so.

## 15. Working method — Telescope

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

Refine type inference, contracts, dependency declaration, boundary isolation, composition, lifecycle, and DX — within the canonical API above.

### L4 — Proof of concept

Build a minimal tested TypeScript implementation.

Avoid expanding scope beyond the concepts justified by the examples.

### L5 — Validation

Test the proposed model with:

1. A single surface provider without dependencies.
2. A surface provider depending on private providers.
3. An explicit binding between different boundary Intents.
4. Missing and duplicate providers (including the same Intent in both `surface` and `providers`).
5. Multiple execution contexts sharing composition-lifetime instances.
6. Context-lifetime providers instantiated independently per execution context.
7. Invalid composition-to-context lifetime dependencies.
8. Lazy initialization, including multiple concurrent first accesses (single shared materialization).
9. Disposal of context-owned resources (`ctx.dispose()`).
10. Public API type inference and prevention of private provider access.
11. Composition-root disposal of composition-lifetime resources (tests + demo app).
12. Compile-time rejection of a `surface` whose provider graph is missing a required provider after bindings.

Distinguish **validated implementation guarantees** from **intended future behavior** (for example partial-composition merge, eager-init opt-out, additional scopes, composition-root disposal API).

Additional scenarios remain useful as the model matures (evolution to orchestration, illegal type-only imports, partial side effects, streaming), but they are not required to accept the composition/lifecycle surface above.

Prioritize **API consistency, TypeScript inference, developer ergonomics, and explicit architectural semantics**.

## 16. Non-goals

Forma must not become:

- A replacement for React or other application runtimes.
- A universal domain-modeling language.
- A mandatory orchestration DSL.
- An opaque service locator or general-purpose IoC container.
- A rigid directory hierarchy.
- A system where every technical operation becomes an Intent.
- A second, manually synchronized description of an application.
- A public Intent lookup that bypasses `surface`.

Boundary isolation must not depend on trusting the AI or on developers manually remembering the rules.

## 17. First deliverable

Produce:

1. A concise conceptual model of Boundary, Intent, Contract, Provider/Realization, and Composition (including `surface` and lifecycle).
2. A TypeScript API aligned with the canonical structure in §5–§7.
3. Concrete examples covering `surface`, private providers, explicit binding, and execution context.
4. Counterexamples and identified weaknesses.
5. A minimal, tested proof of concept (closed compositions only).
6. A small Node demo app (`apps/forma-demo` or equivalent) with Orders + infrastructure Intents: `surface`, bindings, `createExecutionContext`, `.perContext()`, `ctx.dispose()`, and composition-root dispose — no UI framework.

Keep decisions reversible until the model has survived realistic use cases.

**Core hypothesis:**

> Stable business intents, isolated boundaries, and independently evolving realizations enable dynamic architectural seams without sacrificing rigor.

**Success criterion:**

A developer can start from a recognizable business intent, understand its contract, navigate its realization, and modify its behavior without reconstructing the entire codebase or relying on AI.
