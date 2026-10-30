# Forma

Architectural vocabulary for `@xndrjs/forma`: isolated boundaries, declared intents, and composition-owned wiring.

## Language

Forma defines its own terms below. You may organize and name application code with whatever vocabulary you prefer — DDD, hexagonal, Clean Architecture, or none of these. Forma does **not** assume or require those concepts: a Boundary is not necessarily a bounded context, an Intent is not necessarily a use case or a port, an Intent alias is not necessarily a ports-and-adapters “adapter.” When those labels help your team, use them on top of Forma’s primitives; do not treat them as synonyms for the primitives themselves.

Within this toolkit, prefer **Intent** over “capability” so the word does not collide with **capabilities** in `@xndrjs/domain`.

**Boundary**:
An isolated architectural space that owns Intent definitions and their contracts. It is not required to coincide with a DDD bounded context, a package, or a directory — though it may.

**Intent**:
A declared intention named within a Boundary, with a stable identity and contract, independent of how it is fulfilled. Intent identity is the structured pair `(boundaryId, intentName)` only — modality lives on the Contract, not in the identity. Homonymous Boundaries and repeated declarations of the same name coalesce to one identity; identity is never a fresh runtime `Symbol` and is never formed by concatenating those strings (so `("a.b","c")` ≠ `("a","b.c")`). Prefer Intent for replaceable infrastructure as well as business outcomes when identity and wiring matter; not every function, loader, or helper needs to be an Intent. Application code may group or label Intents as use cases, ports, repository methods, etc.; Forma only sees Intent identity and Contract.
_Avoid_: Unary Intent (as a separate primitive), capability (collides with `@xndrjs/domain`)

**Modality**:
Whether an Intent’s Contract is fulfilled as a single terminal outcome (`unary`) or as a pull-based sequence of items (`stream`). Fixed on the Contract; Adapter and Intent alias must preserve it.
_Avoid_: mode (when meaning modality), operation kind

**Contract**:
The TypeScript promise of an Intent: input, outcomes, and expected domain failures, including modality. A **unary** Contract is input, one successful outcome, and expected failures (`Result<Success, Err>`). A **stream** Contract is input, zero or more items, and expected failures (`AsyncIterable<Result<Item, Err>>` with `Err` terminal). Unexpected technical failures are outside the Contract.

**Stream invocation**:
The execution-context-owned lifetime of one surface call to a stream Intent: its iterator, per-call abort signal, and cleanup. Distinct from Provider **Lifetime** (instance materialization). Creating an iterable without iterating does not start a stream invocation. Closed by natural completion, consumer `break` / `return()` / `[Symbol.asyncDispose]`, context dispose, or root dispose (release-once). Host abort on the context signal reaches the invocation signal without auto-disposing the context.
_Avoid_: lease (public term), subscription (unless the domain means that), stream session

**Provider**:
The registrable association of an Intent with a realization, including Intent dependencies (`using`) and a declared lifetime policy. No modifier means `auto`; `.perContext()` forces context ownership and may declare Params; `.perComposition()` pins root ownership. The Composition derives the effective lifetime transitively from the resolved graph — lifetime inference ignores modality. The operative API entity in composition. Built via same-boundary `Intent.provide` or via an Adapter’s `.adapt` (same builders; the operation shape follows the Intent’s modality). `.using(...)` is one-shot (string dependency keys only); put every dependency in a single map. A `using` dependency resolves to the dependency’s **operation** (unary or stream), never to an open stream invocation — opening an iterable is a new invocation owned by an execution context (or a footgun if done outside Forma’s surface wrapper). The factory may return the operation synchronously or as a thenable; Forma coalesces concurrent materializations, rolls back partial `Lifetime` cleanups on failure (without caching the failed attempt), and seals `Lifetime` registration once that attempt finishes.

**Lifetime**:
Hooks available to a Provider factory while that instance is materializing (`onDispose`, owner `signal`). The owner comes from the effective lifetime plan, so an `auto` Provider narrowed by a dependency receives the execution-context signal and cleanup bucket. Cleanups commit only after a successful factory; a failed or abandoned attempt runs them immediately as local rollback. Registration is sealed after the attempt ends and again when the owner disposes. `signal` aborts when the owner enters `disposing`. Execution **params** are not on Lifetime — they appear on the factory `WithContext` only when `.perContext<ParamsReq>()` declared a requirement; lifetime narrowing does not propagate params capability.

**Params**:
Immutable host data passed when opening an execution context (`open` / `with` `{ params }`). Declared per Provider via `.perContext<ParamsReq>()` (object POJO only; nested fields ok). `compose` merges all ParamsReq and requires the host bag; incompatible same-key types fail at compose. Factories see typed `params` on `WithContext`; the execution handle exposes the same frozen bag. Not Intent Input and not named `context` (that word is reserved for Execution context).

**Adapter**:
An architectural identity, peer to Boundary, scoped to exactly one **target Boundary**. Owns external realizations of that target’s Intents; may declare `using` dependencies on Intents from any boundary (including several infrastructure boundaries). Does not own or redefine the target Intents’ contracts. Default path for cross-boundary wiring — including same-shape passthrough — instead of an Intent alias.
_Avoid_: Adapter provider, ports-and-adapters adapter (as a synonym), adapt keyword on compose, multi-target Adapter

**Realization**:
Ordinary TypeScript that fulfills an Intent's Contract. Narrative term for “how”; not a separate public type beside Provider.

**Composition**:
The place that registers providers and Intent aliases (`wiring`), resolves dependencies, defines the public surface, and manages lazy materialization and lifecycles. At `compose`, Forma builds a dependency plan (provider `using` edges and Intent-alias rewrites), rejects cycles with a full path diagnostic, requires a closed graph, and derives each Provider's effective lifetime. An `auto` Provider uses the longest safe lifetime; context ownership propagates transitively from dependencies; a conflicting `.perComposition()` pin fails with the causal path. `root.describePlan()` exposes a read-only lifetime explanation. Prefer an inline `compose({ surface, wiring })` literal — that keeps Provider precision and needs no helper. Use `defineWiring` / `defineComposition` only when extracting wiring or the options bag into a variable/module (a plain array widens and can false-report missing providers). Do not annotate a concrete bag as bare `ComposeOptions` (that widens types and weakens checks). Provider unions in a surface alias or wiring slot are rejected at compose types. The composition root owns composition-effective cache and cleanups and is the backstop for shutdown: `root.dispose()` refuses new execution contexts, disposes every open context, then runs root-owned cleanups (terminal `open → disposing → disposed`, shared dispose promise). Not framed as a general-purpose IoC container; teams may still describe their composition root in familiar DI terms.

**Surface**:
The explicitly declared public aliases of a Composition (`compose({ surface })`); the only callable API for consumers of that composition, exposed as `execution.surface` (borrowed into `withExecutionContext`). Alias keys are strings only; `dispose` and `surface` are reserved for the execution handle (and `__proto__` is rejected). Distinct from an **Intent alias** (identity rewrite in `wiring`).

**Intent alias**:
An identity rewrite, produced by `aliasIntent()` and registered in `compose({ wiring })`, that maps a required Intent identity to a different Intent identity whose provider satisfies it. Typed as `IntentAlias` / `IntentAliasPair`. Not a separate compose key and not a Realization. Valid when contracts are structurally equivalent **including modality** (unary↔unary, stream↔stream only). Prefer an Adapter (or same-boundary Provider) **passthrough** for cross-boundary wiring even when shapes match — an Intent alias is a rare escape hatch for deliberate synonyms (rename / migration), not the default same-shape path.

**Execution context**:
A bounded execution lifetime opened via `openExecutionContext()` (or the safe default `withExecutionContext`). Reuses composition-effective instances; materializes and caches both explicit `.perContext()` Providers and transitively narrowed `auto` Providers within that lifetime; owns in-flight unary surface work and active **stream invocations**; releases them on `dispose()` / `[Symbol.asyncDispose]` (`open → disposing → disposed`, shared dispose promise; accepted work drains before Lifetime is sealed; dispose aborts the context `signal` and actively cancels stream invocations). The owned handle exposes `readonly surface`, `signal`, optional typed `params`, plus lifecycle controls — surface aliases are not flat on the handle. `open` and `with` share `ExecutionContextArgs` (required `{ params }` when Providers declare ParamsReq — inferred by `compose`, or a `compose<Explicit>()` superset; optional host `signal` links without taking dispose ownership). Prefer `with` for short lexical scopes; use `open` when a host owns the lifetime across mount/unmount. Not inherently an HTTP request, unit of work, or session — though a host may map one of those onto it via params.
