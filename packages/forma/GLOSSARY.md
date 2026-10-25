# Forma

Architectural vocabulary for `@xndrjs/forma`: isolated boundaries, declared intents, and composition-owned wiring.

## Language

**Boundary**:
An isolated architectural space that owns Intent definitions and their contracts; not necessarily a DDD bounded context, package, or directory.
_Avoid_: Module, layer, context (unqualified)

**Intent**:
A declared intention — a meaningful outcome named within a Boundary, with a stable identity and contract, independent of how it is fulfilled. Prefer Intent for replaceable infrastructure as well as business outcomes when identity and binding matter; not every function, loader, or helper.
_Avoid_: Capability (Forma), use case (as synonym), service

**Contract**:
The TypeScript promise of an Intent: input, successful outcome, and expected domain failures. Unexpected technical failures are outside the Contract. PoC convention: discriminated `Result<T, E>` for success vs expected failures.
_Avoid_: Schema, interface (unqualified), signature alone

**Provider**:
The registrable association of an Intent with a realization, including Intent dependencies (`using`) and lifecycle (default composition-lifetime or `.perContext()`). The operative API entity in composition.
_Avoid_: Service registration, binding (for this meaning)

**Realization**:
Ordinary TypeScript that fulfills an Intent's Contract. Narrative term for “how”; not a separate public type beside Provider.
_Avoid_: Implementation (as a Forma primitive), adapter (unqualified)

**Composition**:
The place that registers providers, resolves dependencies and bindings, defines the public surface, and manages lazy materialization and lifecycles.
_Avoid_: Container, IoC root (as synonym), app module

**Surface**:
The explicitly declared public aliases of a Composition; the only callable API for consumers.
_Avoid_: Expose, exports, public API (as the compose key name)

**Binding**:
An explicit Composition association from a required Intent identity to a different Intent identity whose provider satisfies it. Valid when contracts are structurally equivalent; otherwise the satisfier side may be wrapped by an ordinary adapter function so the bound pair matches structurally (e.g. conceptually `[A, adapt(B)]`).
_Avoid_: Dedicated `adapt()` composition primitive (unless later justified), wiring (unqualified)

**Execution context**:
A bounded execution lifetime created via `createExecutionContext()`. Reuses composition-lifetime instances; materializes and caches `.perContext()` providers within that lifetime; releases them on `dispose()`. Not a unit of work and not HTTP-specific.
_Avoid_: Request context, unit of work, session (unqualified), scope (as the primary name)

**Adapter provider**:
An ordinary Provider used when a binding’s satisfier is not structurally equivalent to the required Intent; may be produced by a helper that returns a Provider. Not a composition primitive.
_Avoid_: `adapt()` as a `compose` keyword
