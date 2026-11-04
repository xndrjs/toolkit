# Forma: architectural review and design directions

> Status: design analysis, not an ADR and not a normative specification.
>
> Date: 2026-10-29.
>
> Scope: `packages/forma` and `apps/forma-demo` on branch `feature/adapters`.
>
> Evolutionary note: this review snapshots the initial baseline. Decisions later accepted in ADRs
> prevail where implementation has advanced; in particular ADR 0011 replaces the original
> recommendation of manual lifetime propagation, ADR 0006 uses only `openExecutionContext`, and
> ADR 0013 introduces mandatory Entry Boundaries forbidding Adapter roots on the Surface. ADR 0014
> also closes the finding on public factory exposure: Providers are now nominal and expose only
> readonly metadata. ADR 0015 totalizes Boundary exits as `InvocationOutcome`.

## Executive summary

Forma has a promising core: it makes the application graph explicit, keeps realizations private,
exposes a narrow Surface, and concentrates resolution, lazy materialization, and lifecycle in the
Composition.

The most accurate description is neither “DDD framework” nor “general-purpose IoC container”, but:

> a typed application linker, with scoped dependency injection and an explicit façade.

The deepest module is `compose`: behind a small interface it hides a significant amount of behavior
and produces leverage for callers and locality for whoever maintains the runtime. Boundary, Intent,
and Adapter mainly add identity, architectural policy, and provenance.

Alpha status is appropriate. Before stabilization, four interventions are priorities:

1. unify identity semantics between TypeScript and runtime;
2. turn root and Execution context into real lifecycle state machines;
3. validate the entire graph, including cycles, at `compose()` time;
4. make static safety usable even when wiring is modularized.

On the interface side, two directions have especially high return:

- async factories, required to acquire real resources without moving lifecycle into callers;
- `withExecutionContext`, as the safe default for short scopes, keeping
  `openExecutionContext()` for host-owned lifetimes.

For cross-boundary substitutions with equal contracts, an Adapter passthrough is generally more
explicit and semantically safer than `bind`. Binding may remain, but only as an exceptional,
clearly documented identity alias — not as ordinary wiring.

## Method and verification

The review included:

- all sources and tests of `packages/forma`;
- README, glossary, and ADRs;
- all files of `apps/forma-demo`;
- build, lint, and typecheck;
- running the demo;
- isolated TypeScript and runtime probes for cases not covered by the suite.

Baseline results:

- `@xndrjs/forma` build: pass;
- `@xndrjs/forma` lint: pass;
- `@xndrjs/forma` typecheck: pass;
- `@xndrjs/forma-demo` typecheck: pass;
- tests: 9 files, 52 tests, all passed;
- demo: pass, including cleanup of the simulated connection.

Confirmed issues were reproduced separately. Interface considerations and future scenarios are
design evaluations.

## Observed conceptual model

### Intent

An Intent is a nominal token associated with a contract (unary or stream):

```ts
Input -> InvocationOutcome<Success, ExpectedError>
```

The operation may be sync or async. Throws and Promise rejections from the implementation **do
not** cross the Boundary: Forma converts them into `{ kind: "unexpectedFailure", failure }` at the origin
([ADR 0015](./adr/0015-boundary-error-totalization.md)). The Contract declares expected errors on
`Err`; the public algebra also adds `unexpectedFailure` and `cancelled`.

### Provider

A Provider associates an Intent with:

- a factory;
- a named set of Intent dependencies;
- a lifetime, composition-scoped or `.perContext()`;
- a Boundary or Adapter origin.

The Provider is the operative entity registered in the Composition.

### Composition

The Composition:

- registers Providers and Bindings;
- resolves dependencies by identity;
- defines the public Surface;
- materializes Providers lazily;
- shares or isolates instances by lifetime;
- owns disposers.

### Surface and wiring

The Surface is the outer seam of the composed module. Wiring is its private implementation. This
separation is one of the library’s best decisions: the consumer receives only explicitly published
operations and cannot use the Composition as a service locator.

### Adapter

The object created by `adapter(id, targetBoundary)` is mainly an architectural namespace and a
builder with provenance. The concrete realization at the seam is the Provider returned by
`.adapt(intent).with(...)`.

This distinction matters: Forma’s Adapter gains real depth only if its identity and provenance are
later used by diagnostics, introspection, tooling, or composition policy. Today `compose` does not
use `origin` for resolution.

## Evaluation by axis

| Axis                 | Assessment                                                                        |
| -------------------- | --------------------------------------------------------------------------------- |
| Semantic correctness | Good intent, but static and runtime identity diverge                              |
| Ergonomics           | Very good for small inline graphs; fragile under modularization                   |
| Solution quality     | Excellent PoC; lifecycle and concurrency not yet production-grade                 |
| Expressive power     | Strong on façades and integrations; tight on async resources and context data     |
| Testability          | Good through the Surface; concurrent and shutdown scenarios missing               |
| Evolvability         | Promising metadata for tooling, but the public interface exports internal details |

## Particularly successful decisions

### Explicit Surface

The Surface produces least authority: a consumer sees only what the Composition chooses to publish.
Providers in wiring do not accidentally become a public interface.

### Declared dependencies, not looked up

Dependencies are named via `using` and received by the factory. There is no public resolver. That
makes the graph readable, analyzable, and testable.

### Contract owned by the target

An Adapter realizes the target Intent without redefining its contract. In the demo, translation
between Postgres shapes and Orders shapes stays localized in the integration.

### Distinguishing alias and transformation

The design correctly separates:

- Binding: identity rewrite at equal structural contract;
- Adapter: realization with optional mapping of inputs, outputs, and errors.

The separation is conceptually solid, even though a further restriction of Binding usage is proposed
later.

### Captive-dependency defense

The invariant remains: a root-owned Provider cannot capture a context-owned dependency. ADR 0011
preserves it by deriving effective lifetime from the graph: `auto` Providers are narrowed
transitively, while an incompatible `.perComposition()` pin fails at `compose()`.

### LIFO disposal

Cleanups run in reverse registration order, all are attempted, and multiple errors are aggregated.
Because dependencies materialize before consumers, LIFO naturally tends to close the consumer first
and then its dependencies.

### Local inference

Inputs, outputs, errors, and dependencies are inferred from the Intent. In small cases the caller
does not duplicate annotations and the resulting Surface is precise.

## Correctness findings

### F1 — Static and runtime identity diverge

**Priority: blocking before stabilization.**

At runtime every Intent declaration receives a fresh `Symbol` in
[`boundary.ts`](https://github.com/xndrjs/toolkit/blob/main/packages/forma/src/boundary.ts). Static
Composition checking instead uses a string built as `` `${boundaryId}.${name}` `` in
[`compose.ts`](https://github.com/xndrjs/toolkit/blob/main/packages/forma/src/compose.ts).

This creates two notions of identity:

- for TypeScript, two Intents with the same string pair are equal for the graph;
- for the resolver they are equal only if they share the same `Symbol`.

Confirmed scenarios:

1. two distinct `boundary("orders")` objects, each with `intent("find")`;
2. two distinct `Orders.intent("find")` declarations on the same Boundary;
3. `boundary("a.b").intent("c")` and `boundary("a").intent("b.c")`;
4. Boundary or names widened to `string` instead of kept as literals.

In the first and second scenarios TypeScript can declare the graph complete, while the first
invocation fails with `No provider registered`.

The same issue weakens two declared policies:

- `Intent.provide.using` checks “same Boundary” via the string `BoundaryId` alone;
- `Adapter.adapt` checks the target via the same string parameter.

Two Boundary instances with the same ID are therefore interchangeable in types but not at runtime.

#### Recommended direction

Choose a single semantics.

Option A: the pair `(boundaryId, intentName)` is the canonical identity.

- The runtime resolves with a structured key, not a fresh `Symbol`.
- `compose` rejects duplicate declarations or incompatible contracts for the same key.
- Strings are not concatenated with an ambiguous separator.

Option B: identity is truly nominal.

- Boundary or Intent receive a caller-supplied `unique symbol` token.
- The token is propagated in generics.
- TypeScript and runtime compare the same concept.

The choice depends on desired semantics for reload, module duplication, and separate declarations.
The current half-label / half-generative-token solution offers the worst of both.

### F2 — Concurrent cycle deadlock

**Priority: high.**

`seeing`-based detection works for a single A -> B -> A chain. It fails if A and B are
materialized concurrently from two entry points:

```ts
await Promise.all([ctx.a(), ctx.b()]);
```

Each resolution owns its own `seeing`. A finds B in `inflight`, B finds A in `inflight`, and the
two Promises wait on each other without resolving or rejecting.

#### Recommended direction

The graph is known at `compose()`: the Composition should compile an execution plan and validate
cycles before exposing the root. Runtime detection may remain as defense, but must not be the first
line.

Diagnostics should report the full path:

```text
Circular dependency: orders.a -> orders.b -> orders.a
```

### F3 — Race between materialization and `ctx.dispose()`

**Priority: high.**

During materialization `contextDisposed` is checked, then `await resolveDeps(...)` runs. If the
context closes during that wait, the factory may still:

- complete;
- register cleanup into an already-emptied bucket;
- insert the operation into a cache that was already cleared;
- successfully complete a call that started before disposal.

A second `dispose()` returns immediately, so late-registered cleanups may never run.

#### Recommended direction

The context must track:

- state `open | disposing | disposed`;
- active materializations;
- optionally active operations;
- a single disposal Promise shared by all callers.

When disposal starts, new calls must be rejected. In-flight materializations must be awaited or
cancelled and rolled back with explicit semantics.

### F4 — `root.dispose()` is not terminal

**Priority: high.**

The root keeps no disposal state. After `await root.dispose()` it is still possible to:

- create a new Execution context;
- use an existing context;
- rematerialize composition-lifetime Providers;
- register new disposers.

If a root cleanup throws, `compositionOps.clear()` is not reached and a later call may reuse an
operation tied to an already-closed resource.

Two concurrent `dispose()` calls do not necessarily await the same work: the one that finds the
bucket already emptied may complete before the first.

#### Recommended direction

The root must also have a state machine and a shared `disposePromise`. The interface must define
ownership relative to active contexts:

- the root closes all contexts;
- the root waits for them to close;
- or the root refuses disposal while any exist.

The choice must be documented as part of the interface, because correct order cannot be left to a
README example.

### F5 — A Surface alias can overwrite `dispose`

**Priority: medium-high.**

The context is created with a `dispose` method, then Surface aliases are assigned onto the same
object. A Surface with alias `dispose` therefore replaces lifecycle control:

```ts
compose({ surface: { dispose: SomeProvider } });
```

`ctx.dispose()` invokes the Intent and does not release resources. The type is also ambiguous
because it becomes an intersection of the operation and `dispose(): Promise<void>`.

#### Recommended direction

Minimal fix: reserve `dispose` and validate it at `compose()`.

Cleaner but breaking:

```ts
ctx.surface.someOperation(...)
await ctx.dispose()
```

In both cases internal records should be created without a prototype, or special names such as
`__proto__` must be rejected.

### F6 — Static wiring verification is fragile

**Priority: medium.**

Provider extraction from wiring recurses over tuples. An inline tuple therefore keeps precision:

```ts
compose({ surface, wiring: [ProviderA, ProviderB] });
```

A normal extracted array is instead treated as having no Providers:

```ts
const wiring = [ProviderA, ProviderB];
compose({ surface, wiring }); // false Missing provider
```

Annotating with the public `ComposeOptions` type can produce the opposite problem: it widens Surface
and wiring until precise checks and autocomplete are lost.

A dynamically chosen Provider union can finally produce a false positive: the type system considers
Intents from all branches registered, while only one exists at runtime.

#### Recommended direction

Offer helpers with const generics:

```ts
const wiring = defineWiring(ProviderA, ProviderB);

const definition = defineComposition({
  surface,
  wiring,
});
```

`ComposeOptions` should not be presented as an annotation to apply to a concrete configuration. If
it remains public, docs must explain that it widens types.

For union values, choose a policy: reject them, or verify that every possible variant closes the
graph.

### F7 — `symbol` keys are accepted by types but ignored at runtime

**Priority: medium.**

Mapped types over `keyof` include symbols. The implementation uses `Object.keys` and
`Object.entries`, which ignore them.

Confirmed consequences:

- `.using({ [someSymbol]: Dep })` compiles but the factory never receives that dependency;
- a Surface with a symbol alias appears in the context type but not on the runtime object.

The most coherent fix with the current interface is to explicitly restrict aliases and dependency
keys to strings, and validate `Reflect.ownKeys` end-to-end.

### F8 — Repeated `using()` silently replaces dependencies

**Priority: medium-low.**

The builder keeps exposing `.using` after the first call, but the implementation replaces the whole
map:

```ts
SomeIntent.provide.using({ a: A }).using({ b: B }); // A disappears
```

The builder should make `using` one-shot or perform a typed merge that rejects duplicate keys.

## Semantic correctness beyond types

### Structural contract does not describe all behavior

`Input`, `Success`, and `Err` describe the calling convention, but do not express:

- side effects;
- idempotency;
- authorization;
- consistency level;
- ordering;
- retry safety;
- performance and load limits;
- observability;
- possible technical failures.

This is not Forma-specific: it is an intrinsic limit of structural typing. It becomes relevant when
the system uses structural equivalence to rewrite semantically named identities, as Binding does.

### Technical failure and `InvocationOutcome` (superseded finding)

The baseline separated expected failure in `Result` from technical failure via throw. That
separation is **no longer** the normative model: [ADR 0015](./adr/0015-boundary-error-totalization.md)
totalizes every Intent exit as `InvocationOutcome` (`success` / `expectedError` / `unexpectedFailure` /
`cancelled`). Implementation throw/rejection becomes `unexpectedFailure` with an opaque Failure ID; the
optional `onUnexpectedFailure` hook receives the raw cause only for automatic core conversions.

Remaining **outside** the Intent Contract (distinct channels —
[ADR 0008](./adr/0008-execution-seed-and-abort-signal.md)):

- invalid composition (configuration throw at `compose`);
- already-disposed context or root;
- failed cleanup / `dispose()`;
- host abort closing **acceptance** of new work (rejection with `signal.reason` until ADR 0008 is
  further amended).

Those runtime/lifecycle cases still use generic `Error`s and textual messages. Structured errors
with `code`, Intent, origin, and dependency path would improve diagnostics and integration **on
that channel**, without reopening Intent dataflow.

## Ergonomics

### Strengths

- `intent(name).contract<Input, Success, Err>()` is a reasonable compromise with TypeScript’s
  partial-inference limits.
- Dependency operations are inferred from their Intents.
- The Surface is inferred from Providers and normalized to Promise.
- `surface` and `wiring` make public vs private immediately visible.
- `.provide` and `.adapt` make ownership of the realization explicit.
- The demo Composition stays very small.

### Synchronous factories

The factory must return the operation synchronously. The operation may be async, but the setup that
creates it may not. This is deepened in the dedicated section because it directly limits use with
real resources.

### Transitive lifetime narrowing

In the baseline, a `.perContext()` dependency forced every capturing consumer to repeat
`.perContext()`. In the demo the annotation propagated through:

1. ConnectionProvider;
2. SelectOrderProvider;
3. FindOrder Adapter Provider;
4. GetOrderProvider.

The invariant was correct, but manual propagation forced the caller to reconstruct a property the
Composition already knew.

The later decision, formalized in ADR 0011, separates declared policy from effective lifetime:

- no modifier means `auto`;
- `.perContext<Params>()` introduces contextual affinity and optional params access;
- `.perComposition()` pins root sharing and fails if a transitive dependency requires context;
- owner, cache, signal, and cleanup follow effective lifetime;
- params do not propagate to automatically narrowed consumers;
- `describePlan()` shows policy, effective lifetime, and causal path.

In the updated demo only `ConnectionProvider` and `GetOrderProvider` stay explicit; intermediate
Postgres Providers are narrowed by the graph plan, while the memory Adapter remains
composition-effective.

### Context without seed

`createExecutionContext()` accepted no data. That made it hard to initialize per-context Providers
using:

- tenant;
- authenticated identity;
- request id and trace;
- locale;
- transaction metadata;
- host `AbortSignal`.

Current alternatives are propagating these values in every input or reading them from global /
AsyncLocalStorage state. Both can produce invisible coupling.

A typed seed is a natural evolution (later shipped as `params` — ADR 0008):

```ts
const root = compose<RequestScope>({ ... });

const ctx = root.openExecutionContext({
  params: { tenantId, principal },
  signal,
});
```

Params must be immutable and available to per-context factories, not necessarily to every public
operation.

### Manual disposal

The quick start and demo taught a linear sequence:

```ts
const ctx = root.openExecutionContext();
await ctx.surface.someOperation();
await ctx.dispose();
```

If the operation or an intermediate check throws, disposal is skipped. The correct form needs
`try/finally`, but repeating that in every caller is exactly the protocol a deep module should hide.

That motivates `withExecutionContext` and `AsyncDisposable`, discussed later.

### `InvocationOutcome<T, never>` keeps non-success branches

With `Err = never`, the `expectedError` branch is impossible, but `unexpectedFailure` and `cancelled` remain. A
consumer of a domain-“infallible” Intent must still distinguish those kinds — not with `try/catch`
on the called Boundary, but with a switch on the protocol.

In the demo `ConnectionIntent` has `Err = never`; `SelectOrderProvider` propagates non-`success`
unchanged instead of mapping them to an invented expected error.

Directions still open on ergonomics (not protocol):

- conditionally collapse only the `expectedError` branch when `Err = never`;
- distinguish value/resource Providers from operations;
- keep the uniform four-kind shape and accept the switch.

The third option is the one adopted with ADR 0015: maximum unary/stream regularity and Adapter
pass-through.

### Broad public interface

In the baseline the entrypoint exported many implementation types: builders, dependency mapping,
resolved deps, factory context, and origin. `Provider.factory` was public while documented as an
internal hook. This finding was closed by ADR 0014: the current Provider is nominal, immutable, and
does not expose factory or phantom Params.

That had increased:

- autocomplete noise;
- semver surface;
- the ability to build Providers manually, bypassing invariants.

Prefer separating caller-needed types from implementation/tooling details. If inspectability is a
goal, a readonly public descriptor is better than exposing the executable factory.

### Diagnostics

Runtime messages often report only `boundary.name`. The runtime already has origin, aliases, and
dependencies and could show:

- full path;
- involved Surface alias;
- origins of conflicting Providers;
- effective lifetimes;
- missing-wiring suggestion.

`@ts-expect-error` tests prove a TypeScript error exists, but do not stabilize diagnostic quality.
Dedicated compiler fixtures or `tsd` would allow testing real scenarios without relying only on
comments next to directives.

## Deep dive: async factories

### Current state

The factory essentially has this shape:

```ts
type Factory<Deps, Input, Success, Err> = (
  ctx: WithContext<Deps>
) => IntentOperation<Input, Success, Err>;
```

During materialization `compose` invokes the factory without `await` and immediately caches the
result.

Two moments must be distinguished:

1. **materialization**: acquire dependencies and create the operation;
2. **invocation**: run the operation on an input.

Forma allows the second moment to be async, not the first.

### Why an async operation is not enough

Many real resources are acquired asynchronously:

```ts
const client = await pool.connect();
const channel = await broker.createChannel();
const session = await authenticate();
const transaction = await database.begin();
```

If the factory must be sync, the caller has three workarounds.

#### Lazy initialization inside the operation

```ts
.with(({ lifetime }) => {
  let clientPromise: Promise<Client> | undefined;

  return async function execute(input) {
    clientPromise ??= pool.connect();
    const client = await clientPromise;
    // ...
  };
})
```

This moves into the Provider policy Forma should own:

- concurrent coalescing;
- retry after failed setup;
- disposer registration;
- race with disposal;
- cleanup of partial setups.

#### Resource opened outside the Composition

The caller can create the resource before `compose()` and capture it in the factory. Then the root
no longer owns it and lifecycle returns to the application composition root.

#### Acquire on every invocation

The operation can open and close a resource per call. That changes lifetime: it is no longer a
per-Execution-context resource and can be much more expensive.

### Minimal interface extension

The natural form is to make the factory result awaitable:

```ts
type Awaitable<T> = T | PromiseLike<T>;

type Factory<Deps, Input, Success, Err> = (
  ctx: WithContext<Deps>
) => Awaitable<IntentOperation<Input, Success, Err>>;
```

and in materialization:

```ts
const op = await provider.factory(deps, lifetime);
```

This extension does not complicate sync usage and greatly deepens the module: the runtime can handle
concurrency, failure, and cleanup once for all resources.

### Required semantics

A bare `await` is not enough. Before introducing async factories these rules must be fixed.

#### Coalescing

Multiple callers materializing the same Provider in the same lifetime must share one setup Promise.

#### Failure and retry

A failed materialization should not be cached. The next call may retry unless the Provider declares
a different policy.

#### Local rollback

Disposers registered during a failed attempt must not live until the whole context closes. Each
materialization should have a local bucket:

```text
create local lifetime
resolve deps
await factory
if success: commit cleanup to lifetime owner
if failure: run local cleanup immediately
```

That concentrates knowledge of partial setup in the runtime.

If the factory fails and rollback succeeds, the caller observes the original factory error. If both
fail, the result must be `SuppressedError(rollbackError, factoryError)`; if multiple local cleanups
fail, `rollbackError` is an `AggregateError`. Partial setup thus follows the same rule: the primary
failure stays recognizable, and no release error is lost.

#### Closing registration

`Lifetime.onDispose` should be usable only during materialization. After the factory returns the
operation, the local lifetime is sealed; a late registration must fail. Otherwise the operation can
capture `lifetime` and register cleanup after disposal.

#### Cancellation

The factory should receive an `AbortSignal` tied to the scope:

```ts
.with(async ({ lifetime }) => {
  const client = await pool.connect({ signal: lifetime.signal });
  lifetime.onDispose(() => client.release());
  return input => execute(client, input);
})
```

The signal enables cooperative, not guaranteed, cancellation. If the driver does not support it, the
runtime must still await or roll back materialization before declaring disposal complete.

#### Materialization ownership

The owning scope depends on Provider lifetime, not on which context first causes materialization:

- cache, in-flight Promise, signal, and cleanup of a composition-lifetime Provider belong to the
  root;
- cache, in-flight Promise, signal, and cleanup of a per-context Provider belong to that context;
- the context that invokes a composition-lifetime Provider owns only the lease of its own call into
  a shared materialization.

Consequently, closing `ctxA` must not abort or invalidate a root-scoped factory that may also serve
`ctxB`. Only `root.dispose()` cancels it. Symmetrically, a per-context factory cannot outlive its
context. A composition-lifetime Provider must not access execution params: capturing them would
reintroduce a captive dependency environmentally.

This distinction requires that root-scoped cache and in-flight state truly live in the root state
machine; they cannot depend on the closure or `disposed` flag of the context that started the first
resolution.

#### Concurrent disposal

When a scope enters `disposing`:

1. close the public entrance to new materializations and invocations;
2. abort its signal;
3. drain already-accepted operations and materializations, rolling back late results;
4. run cleanups in LIFO;
5. enter `disposed` even if one or more cleanups fail;
6. propagate the aggregated error after completing internal state.

### Effect on expressive power

Async factories open scenarios the demo only simulates today:

- dedicated connection per request or transaction;
- messaging channel;
- distributed locks or leases;
- authenticated sessions;
- temporary resources;
- remote setup with deterministic cleanup.

It is high-leverage because it stops every Adapter from reinventing an initialization runtime.

## Deep dive: Execution-context ownership

### The problem

The then-current interface exposed only the manual primitive:

```ts
const ctx = root.createExecutionContext();
try {
  return await ctx.someOp();
} finally {
  await ctx.dispose();
}
```

The primitive is necessary, but not a safe default. The caller must remember an ordering protocol
and correctly combine body errors with cleanup errors.

An Execution context’s duration can be owned in two genuinely different ways.

#### Lexical ownership

Promise end coincides with scope end:

- CLI command;
- job;
- non-streaming HTTP handler;
- message consumer;
- transaction callback;
- test.

#### Host ownership

Open and close happen in different callbacks or phases:

- mount/unmount of a module or controller;
- WebSocket or subscription;
- session or actor;
- long-lived stream;
- framework plugin;
- object that uses the context across multiple methods.

A single form does not express both cases well.

### Design A — Standard `AsyncDisposable` protocol only

The smallest-interface solution keeps the explicit primitive and adds the standard protocol:

```ts
type AsyncLifetime = {
  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

type CompositionRoot<Surface> = AsyncLifetime & {
  createExecutionContext(): ExecutionContext<Surface>;
};
```

Lexical use:

```ts
await using root = compose({ surface, wiring });

{
  await using ctx = root.createExecutionContext();
  await ctx.someOp();
}
```

Host-managed use:

```ts
const ctx = root.createExecutionContext();
host.onStop(() => ctx.dispose());
```

#### Advantages

- minimal Forma interface;
- error-composition semantics already defined by the language;
- lexical lifetime visible via the block;
- no callback inversion.

#### Disadvantages

- requires TypeScript with Explicit Resource Management and `ESNext.Disposable` in lib;
- less discoverable than a named method;
- many codebases do not yet use `await using`;
- the callback cannot receive a borrowed Surface that hides lifecycle control.

Given the Node 24 requirement, runtime support exists. The package should still correctly declare
disposable types for consumers.

### Design B — Rich handle with scope and resource acquisition

The most flexible solution cleanly separates operations and ownership:

```ts
type ExecutionContext<Surface, Seed> = {
  readonly operations: ExecutionSurface<Surface>;
  readonly seed: Readonly<Seed>;
  readonly signal: AbortSignal;
  dispose(reason?: unknown): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

type CompositionRoot<Surface, Seed = void> = {
  openExecutionContext(options: ExecutionContextOptions<Seed>): ExecutionContext<Surface, Seed>;
  withExecutionContext<T>(
    callback: (surface: ExecutionSurface<Surface>) => Awaitable<T>,
    options: ExecutionContextOptions<Seed>
  ): Promise<Awaited<T>>;
  dispose(reason?: unknown): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};
```

`Lifetime` may also offer atomic resource acquisition:

```ts
type Lifetime = {
  readonly signal: AbortSignal;
  onDispose(cleanup: Disposable): void;
  acquire<T>(
    acquire: (signal: AbortSignal) => Awaitable<T>,
    release: (resource: T) => Awaitable<void>
  ): Promise<T>;
  use<T extends AsyncDisposable>(resource: T | PromiseLike<T>): Promise<T>;
};
```

`acquire` removes the window between completed acquisition and manual cleanup registration.

#### Advantages

- supports seed, cancellation, and resource acquisition coherently;
- finally separates Surface and lifecycle controls;
- suits diverse hosts and frameworks;
- enables rich tooling and diagnostics.

#### Disadvantages

- a large complexity jump for an alpha;
- introduces many decisions before real use cases exist;
- `Lifetime.acquire` and context definitions can become a second framework inside Forma;
- increases the semver surface.

### Design C — Additive safe default plus explicit primitive

The caller-oriented compromise keeps one lifecycle implementation but offers two entrances for
different ownerships:

```ts
type Awaitable<T> = T | PromiseLike<T>;

type ExecutionContext<Surface, Seed> = {
  readonly surface: ExecutionSurface<Surface>;
  readonly signal: AbortSignal;
  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

type CompositionRoot<Surface, Seed = void> = {
  openExecutionContext(...options: ExecutionContextArgs<Seed>): ExecutionContext<Surface, Seed>;

  withExecutionContext<T>(
    run: (surface: ExecutionSurface<Surface>) => Awaitable<T>,
    ...options: ExecutionContextArgs<Seed>
  ): Promise<Awaited<T>>;

  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};
```

`openExecutionContext` communicates ownership transfer better than `createExecutionContext`. During
migration the old name may remain as a deprecated alias (later removed).

Simple use:

```ts
const result = await root.withExecutionContext(async (surface) => {
  return surface.someOp(input);
});
```

Integrated into an external lifecycle:

```ts
class SomeModule {
  readonly #execution = root.openExecutionContext({ params: seed });
  readonly operations = this.#execution.surface;

  onDestroy(): Promise<void> {
    return this.#execution.dispose();
  }
}
```

Lexical use without callback:

```ts
await using execution = root.openExecutionContext({ params: seed });
await execution.surface.someOp(input);
```

### Comparison

| Design                   | Depth     | Locality | Simple ergonomics                | Host-managed lifecycle | Interface cost |
| ------------------------ | --------- | -------- | -------------------------------- | ---------------------- | -------------- |
| A — AsyncDisposable only | High      | High     | Good if `await using` is adopted | Excellent              | Minimal        |
| B — rich handle          | Very high | High     | Good                             | Excellent              | High           |
| C — hybrid               | High      | High     | Excellent                        | Excellent              | Moderate       |

### Recommendation

Recommendation: **Design C**, introduced incrementally.

1. The universal primitive remains an explicitly owned handle.
2. `withExecutionContext` becomes the documented safe default for short scopes.
3. `[Symbol.asyncDispose]` supports lexical scopes without a callback.
4. All paths delegate to the same state machine; different disposal semantics must not exist.
5. Typed params and `AbortSignal` can be added together with async factories.
6. Defer `Lifetime.acquire` until two or more real integrations demonstrate the need.

`withExecutionContext` passes the deletion test: removing it, `try/finally`, error composition, and
cleanup discipline reappear in every handler that does not use `await using`. It remains a
convenience over the primitive, not a second lifecycle.

### Precise semantics of `withExecutionContext`

```ts
await root.withExecutionContext(async (surface) => {
  await surface.someOp();
});
```

It must:

1. open a context;
2. invoke the callback once;
3. fully await the returned value;
4. start disposal on throw, rejection, or early return;
5. await disposal before completing;
6. not expose the lifecycle handle to the callback — only a borrowed Surface.

Error matrix:

| Callback | Cleanup | Result                                         |
| -------- | ------- | ---------------------------------------------- |
| success  | success | callback value                                 |
| failure  | success | same callback error                            |
| success  | failure | cleanup error                                  |
| failure  | failure | `SuppressedError(cleanupError, callbackError)` |

If multiple cleanups fail, `cleanupError` is an `AggregateError`. This matches `await using` on a
single execution handle whose `[Symbol.asyncDispose]` aggregates cleanups internally, and loses
neither error. Separately declared `await using` resources normally produce nested
`SuppressedError`s instead.

A bare `finally { await ctx.dispose() }` without explicit error composition is not enough, because
cleanup error can hide the body error in an undocumented way.

### Why the callback can be worse for a component lifecycle

The callback is correct only when the returned Promise represents the whole scope duration.

For a module, controller, WebSocket, or UI lifecycle, mount and unmount happen at different times.
Forcing `withExecutionContext` leads to two anti-patterns:

- the callback returns after setup and the context closes too early;
- the callback artificially keeps a Promise pending until teardown.

In those cases the host must own the handle:

```ts
const execution = root.openExecutionContext({ params: seed });

host.provide("some-operations", execution.surface);
host.onStop(() => execution.dispose());
```

Host-specific integration is a thin module over the lifecycle seam. Do not fold it into the core
until at least two hosts justify a common interface.

If the host teardown hook cannot await a Promise, Forma cannot guarantee the caller observes cleanup
errors. The integration must forward them to the host’s error-reporting mechanism.

### Escape and fire-and-forget

The type system cannot fully prevent an operation or context-bound value from escaping the
callback. After return, new invocations must fail because the context is disposed.

Likewise:

```ts
await root.withExecutionContext(async (ctx) => {
  void ctx.longRunningOp();
});
```

is intrinsically ambiguous. The callback declared the work finished while an operation still uses
resources.

The runtime should track active surface calls and await those started before disposal. A call still
active when the callback ends is, from a lifecycle view, detached work: if it rejects during
draining, its failure becomes a `drainError`.

Multiple draining failures form an `AggregateError`. Draining and cleanup together constitute the
lifecycle failure; if the callback also fails, compose as
`SuppressedError(lifecycleError, callbackError)`. An unawaited call that already settled before the
callback ended is not reliably distinguishable from a failure the callback observed and handled: the
contract must therefore forbid fire-and-forget, and the runtime can at most flag it via diagnostics.

This wait protects against use-after-dispose; it is not a promise that fire-and-forget is supported.
A detached operation that never ends can block close.

### Draining and dependency calls

When the context enters `disposing` it must reject new Surface calls. It cannot indiscriminately
reject every dependency invocation:

- an already-started Surface call may `await` and use a dependency later;
- a Provider disposer may need to use a dependency before that dependency is closed.

The runtime must distinguish four phases:

1. on entering `disposing`, the external Surface is closed to new work;
2. already-accepted calls keep a causal lease and may complete their graph, including lazy
   materializations needed by that call;
3. after draining, no new materializations are allowed; during cleanup, each disposer keeps an
   internal lease on already-materialized, graph-declared, not-yet-closed dependencies only;
4. after cleanups finish, every invocation is rejected and the scope is terminally `disposed`.

Thus a disposer can still use a live dependency without reopening the graph or accepting new
external work.

LIFO derived from the dependency graph lets the consumer close before the dependency. Detached work
outside the lease is unsupported.

### `root.dispose()` as backstop

The root must track open contexts. Recommended disposal is:

1. synchronous transition to `disposing`;
2. block new contexts;
3. abort context signals;
4. dispose every still-open context;
5. await their draining and cleanup;
6. dispose composition-lifetime resources;
7. final error aggregation;
8. terminal `disposed` even on failure.

Thus the root is also a backstop for a forgotten context. The host should still stop accepting new
work before root shutdown.

## Deep dive: Binding or Adapter passthrough

### What Binding does

`bind(required, satisfier)` does not create a Realization. It registers a rewrite:

```text
required Intent identity -> satisfier Intent identity
```

The resolver materializes the satisfier Provider directly. There is therefore no:

- required-Intent factory;
- wrapper operation;
- dedicated origin;
- place to add mapping or policy;
- new lifetime to declare.

The type system accepts Binding only when Input, Success, and Err are mutually assignable. That
proves structural compatibility, not semantic equivalence.

### Why it is dangerous

Intent introduces identity precisely to distinguish operations that may share a shape. Binding can
erase that distinction.

Two structurally equal Intents may differ in:

- meaning of the result;
- applied authorization;
- data consistency;
- idempotency;
- side effects;
- retry safety;
- latency or rate limit;
- technical errors;
- required observability.

Example: `users.find` and `cache.get` may share the same types without being substitutable.

The substitution point is visible in wiring, but there is no module that embodies and documents that
decision.

### Adapter passthrough

An Adapter passthrough explicitly realizes the required Intent via the satisfier:

```ts
const OrdersPostgres = adapter("orders-postgres", Orders);

const FindOrderViaPostgres = OrdersPostgres.adapt(FindOrder)
  .perContext()
  .using({ select: SelectOrder })
  .with(
    ({ deps: { select } }) =>
      function findOrder(input) {
        return select(input);
      }
  );
```

Even without mapping, this form preserves important information:

- `FindOrder` keeps its runtime identity;
- the graph plan shows a `FindOrder -> SelectOrder` edge;
- integration origin is explicit;
- lifetime and captive dependency are checked on the passthrough Provider;
- tracing and diagnostics can show both Intents;
- policy can be added later without changing consumers.

The cost is:

- more boilerplate;
- a wrapper operation;
- explicit lifetime propagation;
- one extra runtime hop.

For I/O-bound operations the runtime cost is negligible versus the semantic gain.

### When Binding is justified

Binding is reasonable only when the two Intents are deliberately synonyms, not merely compatible.

Possible examples:

- rename during a migration;
- temporary alias between old and new identity;
- two entry points the domain formally declares equivalent;
- version compatibility without mapping or policy.

Even then, restrictions are needed:

- no implicit Binding chains;
- no cycles;
- inspectable reason/provenance;
- diagnostics showing required and satisfier;
- documentation of the semantic obligation, not only the structural one.

A more honest form could be:

```ts
aliasIntent(OldFindOrder, FindOrder, {
  reason: "temporary rename during orders-v2 migration",
});
```

The name `bind` is generic and can be read as ordinary dependency binding. `aliasIntent` or
`unsafeAliasIntent` communicates better that it is not creating a Realization.

### Recommendation

Clear recommendation:

- **cross-boundary**: use an Adapter passthrough even when shapes match;
- **same-boundary**: use a Provider passthrough, except for a true migration alias;
- **Binding**: keep only as a rare escape hatch and rename it as alias;
- if before v1 no concrete case appears that a passthrough cannot replace, remove it from the stable
  interface.

Do not immediately introduce a `forward` helper. If passthrough boilerplate repeats in real cases, a
future:

```ts
OrdersPostgres.forward(FindOrder).to(SelectOrder);
```

should generate a real Provider with a dependency edge, not a disguised identity rewrite.

## Review of `forma-demo`

### What it demonstrates well

- separation between Orders and Postgres;
- contracts with different shapes;
- Adapter translating inputs, outputs, and errors;
- minimal Surface;
- private wiring;
- fully per-context chain;
- cleanup of the simulated connection.

### Shallow module

`GetOrderProvider` only delegates to `FindOrder`. The Surface can already rename a Provider as
`getOrder`, so removing that pass-through does not reintroduce complexity elsewhere.

The demo thus risks presenting Forma as ceremony rather than leverage.

Possible improvements:

- authorization before read;
- cache with fallback;
- enrichment from multiple Boundaries;
- mapping of more error categories;
- real application policy;
- metrics or tracing.

### Simulated Postgres

The “connection” is built synchronously over a `Map`. Useful for explaining the graph, but it does
not exercise:

- async acquisition;
- failure during setup;
- transaction scope;
- cancellation;
- race between setup and disposal.

After async-factory support, the demo should use at least one fake resource acquired with a Promise
and a controlled cleanup test.

### A single Adapter

The seam becomes concretely justified when at least two Adapters exist. A second in-memory or test
Composition would show the payoff:

```text
Orders Intent <- Postgres Adapter
              <- In-memory Adapter
```

### Non-exception-safe disposal

The demo closed context and root only on the happy path. It should teach the safe path:

```ts
await using root = compose(...);

await root.withExecutionContext(async (surface) => {
  await surface.getOrder(...);
});
```

or explicitly show `try/finally` for the host-managed path.

### Naming

In the demo `OrdersAdapter` is a Forma Adapter, while `FindOrderAdapter` is a Provider. More precise
names would be `OrdersPostgres` for the first and `FindOrderViaPostgresProvider` for the second.

## Expressive power

### Scenarios opened well

#### Modular monolith

Each Composition can expose a narrow façade and keep its graph private. That reduces coupling between
caller and implementation.

#### Production/test variants

Different Providers and Adapters can realize the same Intents without changing consumers. An
in-memory Composition becomes a test double for the whole module, not a collection of internal
mocks.

#### Anti-corruption layer

Adapter can concentrate mapping between domain contracts and vendor/infrastructure, including errors
and orchestration of multiple dependencies.

#### Request and unit-of-work scope

With correct lifecycle, params, and async factories, an Execution context can represent request,
transaction, message handling, or unit of work.

#### Progressive migrations

New Adapters can coexist with existing Providers in different Compositions. Migration aliases can
help when semantically explicit.

#### Architectural tooling

Inspectable Providers open:

- graph visualization;
- architecture tests;
- lifetime diagnostics;
- Adapter inventory;
- generated documentation;
- readiness plans;
- composition diffing.

### Scenarios closed or unnatural today

- resources that require async setup without factory support (addressed by ADR 0007);
- host-owned long-lived contexts without a clear open/dispose story (addressed by Design C /
  ADR 0006);
- streaming Invocations without modality (addressed by ADR 0012);
- Adapter Surface roots as public entry (rejected by ADR 0013);
- unexpected failures escaping as throw across Boundaries (addressed by ADR 0015).

## Design risks and anti-patterns

### Intent explosion

Turning every helper into an Intent inflates the graph without leverage. Prefer Intent where
identity, replaceability, or composition matter.

### God Adapter

An Adapter that orchestrates many unrelated Boundaries becomes a second Composition. Prefer thin
Adapters and Boundary-owned policy.

### Architecture theatre

Ceremony without ownership or replaceability (empty passthrough layers) teaches the wrong lesson.
Each layer should preserve a decision or a seam.

### Shallow wrapper

A Provider that only renames without policy, mapping, or ownership adds noise. Use Surface aliases
or genuine seams instead.

### Semantic laundering via Binding

Using Binding to treat structurally equal Intents as synonyms without domain justification erases
Intent’s purpose. Prefer Adapter/Provider passthrough or an explicit alias with reason.

## Recommended test strategy

### High-priority missing tests

#### Identity

- duplicate Boundary instances with the same ID;
- duplicate Intent declarations;
- ambiguous concatenated identity strings;
- widened `string` Boundary IDs.

#### Graph

- concurrent cycle A/B materialization;
- missing provider diagnostics with full path;
- competing realizations;
- closed-graph checks after modularized wiring.

#### Lifecycle

- dispose during materialization;
- concurrent root/context dispose;
- Surface alias colliding with `dispose`;
- abort vs dispose ownership;
- stream cleanup error matrix.

#### Async factory

- coalescing;
- failed attempt not cached;
- local rollback;
- sealed `onDispose` after return;
- signal cancellation during acquire.

#### `withExecutionContext`

- body vs cleanup error composition;
- fire-and-forget draining;
- borrowed Surface cannot dispose;
- host-owned open handle across methods.

### Diagnostic tests

Stabilize TypeScript diagnostics with dedicated fixtures (`tsd` or compiler harness), not only
`@ts-expect-error` comments.

## Packaging and documentation

- Keep README examples aligned with ADR decisions (`entryBoundaries`, `InvocationOutcome`,
  `open`/`with`, Adapter passthrough).
- Glossary terms must stay free of outdated “technical failure outside Result” wording.
- Prefer ADRs for irreversible decisions; keep this review as design history.
- Demo naming should distinguish Adapter identity from Provider realization.
- Package validation (`validate:forma-package`) should remain the consumer smoke test for published
  shapes.

## Recommended roadmap

### P0 — Coherence and lifecycle

1. Canonical Intent identity shared by types and runtime.
2. Root and context state machines with shared dispose promises.
3. Compose-time cycle / closed-graph validation.
4. Reserve Surface lifecycle keys.

### P1 — Safe path and real resources

1. `withExecutionContext` + `AsyncDisposable`.
2. Async factories with coalescing and local rollback.
3. Typed execution params and host signal (ADR 0008).

### P2 — Semantic clarity

1. Prefer Adapter/Provider passthrough; Binding → rare `aliasIntent`.
2. Entry Boundaries; no Adapter Surface roots (ADR 0013).
3. Stream modality and ownership (ADR 0012).
4. Boundary error totalization (ADR 0015).

### P3 — Tooling, only after consolidation

1. Richer `describePlan()` / graph visualization.
2. Architecture tests over composition plans.
3. Remote Adapter spike for streams.

## Conclusion

Forma’s core thesis holds: a typed linker with an explicit Surface and Composition-owned lifecycle
can hide substantial complexity behind a small API. The baseline PoC already demonstrates that
value. Stabilization work is mainly about making identity, lifecycle, and failure channels coherent
end-to-end — work that subsequent ADRs (0006–0015) progressively encode. This review remains the
design rationale and finding inventory behind those decisions.
