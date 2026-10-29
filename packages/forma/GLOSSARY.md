# Forma

Architectural vocabulary for `@xndrjs/forma`: isolated boundaries, declared intents, and composition-owned wiring.

## Language

Forma defines its own terms below. You may organize and name application code with whatever vocabulary you prefer — DDD, hexagonal, Clean Architecture, or none of these. Forma does **not** assume or require those concepts: a Boundary is not necessarily a bounded context, an Intent is not necessarily a use case or a port, a Binding is not necessarily a ports-and-adapters “adapter.” When those labels help your team, use them on top of Forma’s primitives; do not treat them as synonyms for the primitives themselves.

Within this toolkit, prefer **Intent** over “capability” so the word does not collide with **capabilities** in `@xndrjs/domain`.

**Boundary**:
An isolated architectural space that owns Intent definitions and their contracts. It is not required to coincide with a DDD bounded context, a package, or a directory — though it may.

**Intent**:
A declared intention — a meaningful outcome named within a Boundary, with a stable identity and contract, independent of how it is fulfilled. Intent identity is the structured pair `(boundaryId, intentName)`: homonymous Boundaries and repeated declarations of the same name coalesce to one identity; identity is never a fresh runtime `Symbol` and is never formed by concatenating those strings (so `("a.b","c")` ≠ `("a","b.c")`). Prefer Intent for replaceable infrastructure as well as business outcomes when identity and binding matter; not every function, loader, or helper needs to be an Intent. Application code may group or label Intents as use cases, ports, repository methods, etc.; Forma only sees Intent identity and Contract.

**Contract**:
The TypeScript promise of an Intent: input, successful outcome, and expected domain failures. Unexpected technical failures are outside the Contract. PoC convention: discriminated `Result<T, E>` for success vs expected failures.

**Provider**:
The registrable association of an Intent with a realization, including Intent dependencies (`using`) and lifecycle (default composition-lifetime or `.perContext()`). The operative API entity in composition. Built via same-boundary `Intent.provide` or via an Adapter’s `.adapt`. `.using(...)` is one-shot (string dependency keys only); put every dependency in a single map. The factory may return the operation synchronously or as a thenable; Forma coalesces concurrent materializations, rolls back partial `Lifetime` cleanups on failure (without caching the failed attempt), and seals `Lifetime` registration once that attempt finishes.

**Lifetime**:
Hooks available to a Provider factory while that instance is materializing (`onDispose`, scope `signal`, and for `.perContext()` only an immutable execution `seed`). Cleanups commit to the owning scope (composition root or execution context) only after a successful factory; a failed or abandoned attempt runs them immediately as local rollback. Registration is sealed after the attempt ends and again when the owning scope disposes. `signal` aborts when the owning scope enters `disposing`. Composition-lifetime factories must not read `seed`.

**Adapter**:
An architectural identity, peer to Boundary, scoped to exactly one **target Boundary**. Owns external realizations of that target’s Intents; may declare `using` dependencies on Intents from any boundary (including several infrastructure boundaries). Does not own or redefine the target Intents’ contracts.
_Avoid_: Adapter provider, ports-and-adapters adapter (as a synonym), adapt keyword on compose, multi-target Adapter

**Realization**:
Ordinary TypeScript that fulfills an Intent's Contract. Narrative term for “how”; not a separate public type beside Provider.

**Composition**:
The place that registers providers and identity aliases (`wiring`), resolves dependencies, defines the public surface, and manages lazy materialization and lifecycles. At `compose`, Forma builds a dependency plan (provider `using` edges and Binding rewrites), rejects cycles with a full path diagnostic, and requires a closed graph before exposing the root. Extracted wiring should use `defineWiring` (or an equivalent precise tuple) so static completeness checks stay accurate; do not annotate a concrete bag as bare `ComposeOptions` (that widens types and weakens checks). Provider unions in a surface alias or wiring slot are rejected at compose types. The composition root owns composition-lifetime cache and cleanups and is the backstop for shutdown: `root.dispose()` refuses new execution contexts, disposes every open context, then runs composition-lifetime cleanups (terminal `open → disposing → disposed`, shared dispose promise). Not framed as a general-purpose IoC container; teams may still describe their composition root in familiar DI terms.

**Surface**:
The explicitly declared public aliases of a Composition (`compose({ surface })`); the only callable API for consumers of that composition, exposed as `execution.surface` (borrowed into `withExecutionContext`). Alias keys are strings only; `dispose` and `surface` are reserved for the execution handle (and `__proto__` is rejected).

**Binding**:
An alias, produced by `bind()` and registered in `compose({ wiring })`, that rewrites a required Intent identity to a different Intent identity whose provider satisfies it. Not a separate compose key and not a Realization. Valid when contracts are structurally equivalent. Prefer an Adapter when translation or multi-boundary orchestration is required; Binding remains a lightweight escape hatch for same-shape identities.

**Execution context**:
A bounded execution lifetime opened via `openExecutionContext()` (or the safe default `withExecutionContext`). Reuses composition-lifetime instances; materializes and caches `.perContext()` providers within that lifetime; releases them on `dispose()` / `[Symbol.asyncDispose]` (`open → disposing → disposed`, shared dispose promise; in-flight surface work drains before Lifetime is sealed; dispose aborts the context `signal`). The owned handle exposes `readonly surface`, `signal`, optional typed `seed`, plus lifecycle controls — aliases are not flat on the handle. `open` and `with` share `ExecutionContextArgs<Seed>` (required `{ seed }` when the composition root is seeded via `compose<Seed>()({ … })`; optional host `signal` links without taking dispose ownership). Prefer `with` for short lexical scopes; use `open` when a host owns the lifetime across mount/unmount. Not inherently an HTTP request, unit of work, or session — though a host may map one of those onto it via seed.
