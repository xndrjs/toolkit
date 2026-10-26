# Forma

Architectural vocabulary for `@xndrjs/forma`: isolated boundaries, declared intents, and composition-owned wiring.

## Language

Forma defines its own terms below. You may organize and name application code with whatever vocabulary you prefer — DDD, hexagonal, Clean Architecture, or none of these. Forma does **not** assume or require those concepts: a Boundary is not necessarily a bounded context, an Intent is not necessarily a use case or a port, a Binding is not necessarily an adapter. When those labels help your team, use them on top of Forma’s primitives; do not treat them as synonyms for the primitives themselves.

Within this toolkit, prefer **Intent** over “capability” so the word does not collide with **capabilities** in `@xndrjs/domain`.

**Boundary**:
An isolated architectural space that owns Intent definitions and their contracts. It is not required to coincide with a DDD bounded context, a package, or a directory — though it may.

**Intent**:
A declared intention — a meaningful outcome named within a Boundary, with a stable identity and contract, independent of how it is fulfilled. Prefer Intent for replaceable infrastructure as well as business outcomes when identity and binding matter; not every function, loader, or helper needs to be an Intent. Application code may group or label Intents as use cases, ports, repository methods, etc.; Forma only sees Intent identity and Contract.

**Contract**:
The TypeScript promise of an Intent: input, successful outcome, and expected domain failures. Unexpected technical failures are outside the Contract. PoC convention: discriminated `Result<T, E>` for success vs expected failures.

**Provider**:
The registrable association of an Intent with a realization, including Intent dependencies (`using`) and lifecycle (default composition-lifetime or `.perContext()`). The operative API entity in composition.

**Realization**:
Ordinary TypeScript that fulfills an Intent's Contract. Narrative term for “how”; not a separate public type beside Provider.

**Composition**:
The place that registers providers, resolves dependencies and bindings, defines the public surface, and manages lazy materialization and lifecycles. Not framed as a general-purpose IoC container; teams may still describe their composition root in familiar DI terms.

**Surface**:
The explicitly declared public aliases of a Composition (`compose({ surface })`); the only callable API for consumers of that composition.

**Binding**:
An explicit Composition association from a required Intent identity to a different Intent identity whose provider satisfies it. Valid when contracts are structurally equivalent; otherwise the satisfier side may be wrapped by an ordinary adapter function so the bound pair matches structurally (e.g. conceptually `[A, adapt(B)]`).

**Execution context**:
A bounded execution lifetime created via `createExecutionContext()`. Reuses composition-lifetime instances; materializes and caches `.perContext()` providers within that lifetime; releases them on `dispose()`. Not inherently an HTTP request, unit of work, or session — though a host may map one of those onto it.

**Adapter provider**:
An ordinary Provider used when a binding’s satisfier is not structurally equivalent to the required Intent; may be produced by a helper that returns a Provider. Not a dedicated `adapt()` keyword on `compose`.
