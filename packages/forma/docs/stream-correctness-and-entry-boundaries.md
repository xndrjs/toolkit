# Stream correctness and Entry Boundaries

> Status: decisions implemented; rationale, findings, and plan kept as a design record.
>
> Date: 2026-10-30.
>
> Scope: current stream implementation, Surface root semantics, Adapter directionality, and
> introduction of Entry Boundaries.

## Implementation outcome

The grill decisions were applied to the core, type-level asserts, the demo, and documentation:

- `compose` requires `entryBoundaries` and validates exact correspondence with Surface Boundary
  origins;
- precise provenance flows through `Provider`, Boundary builders, and Adapter builders;
- Adapter roots, duplicate/unrepresented Entry Boundaries, and empty Surfaces are rejected at
  compile time when types are precise, and always at runtime;
- `describePlan()` includes Entry Boundaries and root provenance;
- the demo exposes Orders’ `WatchOrdersProvider` and privately resolves `WatchOrderEvents` via
  Adapter;
- already-aborted signals, post-abort acceptance, and stream cleanup follow the agreed semantics;
- owner-driven closes do not produce floating rejections; the context observes failures and still
  attempts every Provider disposer;
- the deprecated `createExecutionContext` alias was removed.

Normative decisions are recorded in ADRs 0008, 0012, and 0013.

## Grill status

### Shared decisions — round 1

1. An Adapter-originated Provider can never be a Surface root; `compose` offers no escape hatch
   around this rule.
2. A Composition is a unit of runtime/lifecycle ownership, not a one-to-one projection of a
   Boundary. It declares one or more Entry Boundaries and may privately cross other Boundaries.
3. If the parent signal is already aborted at the first `next()`, the stream ends normally without
   materializing the Provider and without starting the source.
4. Every close failure must be observed by the actor that owns or starts the close; every later
   cleanup is still attempted and multiple failures are aggregated.

### Shared decisions — round 2

1. `compose` keeps a single options bag with a required non-empty `entryBoundaries`; no new
   currying or fluent builder is introduced.
2. The `Provider` type keeps precise provenance through a final `Origin` generic; Boundary and
   Adapter builders keep literal `kind` and ID.
3. Abort does not mask technical failures of an already-active source: a source that completes in
   response to the signal ends normally; a source that rejects still produces a technical error.
4. Close remains represented by a single idempotent promise. Concurrent callers may observe the
   same rejection; there is no “consumed error” state.

### Shared decisions — round 3

1. Migration is intentionally breaking: `entryBoundaries` becomes required with no legacy
   overload, fallback, automatic inference, or deprecated API.
2. Distinct Entry Boundaries with the same canonical ID are duplicates and are rejected at
   runtime, with best-effort type-level checks for literal tuples.
3. `describePlan()` is extended with Entry Boundaries and Surface-root provenance, but not yet
   with the full dependency graph.
4. `defineEntryBoundaries()` is not introduced; the inline declaration is the supported form for
   the new list.
5. The demo separates the `WatchOrders` entry Intent from the `WatchOrderEvents` dynamic seam,
   keeping the same Contract for now.
6. The Entry Boundary decision gets a new ADR; ADR 0001 is superseded only for Adapter roots, and
   ADR 0012 clarifies pre-abort and error ownership.

### Shared decisions — round 4

1. `defineWiring` and `defineComposition` remain available for extracted wiring and config, but no
   dedicated Entry Boundary helper is introduced; primary examples use the inline form.
2. The declared Entry Boundary set must match the set of Boundary origins actually present on the
   Surface: no implicit Boundaries and no declared-but-unused Entry Boundaries.
3. Host abort does not automatically dispose the context, but stops it from accepting new work: a
   stream does not start and a new unary invocation is rejected before materialization.
   Already-accepted work remains cooperative via the signal.

### Shared decisions — round 5

1. A Composition with `surface: {}` is invalid: Entry Boundaries are non-empty and must match
   exactly the Boundary origins represented on the Surface.
2. `openExecutionContext({ signal })` fails immediately if the host signal is already aborted. If
   abort happens after open, the context accepts no new work but remains host-owned and must still
   be disposed.
3. A new unary invocation after host abort rejects with `signal.reason`, following standard
   `AbortSignal.throwIfAborted()` semantics. Host-abort acceptance failure is outside the Intent
   `InvocationOutcome` channel ([ADR 0008](./adr/0008-execution-seed-and-abort-signal.md));
   catalogueable Intent cancellation uses the `cancelled` branch when expressed as Contract data
   ([ADR 0015](./adr/0015-boundary-error-totalization.md)).

The grill decision front is closed. Implementation can start after explicit confirmation of the
shared understanding summarized in this document.

## Executive summary

Forma’s streaming model is structurally sound: modality belongs to the Contract, stream-invocation
lifetime is separate from Provider lifetime, the Surface exposes a cold `AsyncIterable`, and all
normal close paths converge on the same state machine.

The review nevertheless found two concrete bugs and a consequent cleanup-composition risk:

1. an already-aborted parent signal can close the stream before `startPromise` exists; the source
   is still started immediately afterward but never receives `return()`;
2. a cleanup error from an abort-driven close is not observed by the owner:
   `ExecutionContext.dispose()` may resolve while Node receives an `unhandledRejection`;
3. a naive fix for the second issue would surface another defect: today a `streams.closeAll()`
   error would prevent context-owned Provider disposers from running.

The architectural review also highlighted a directionality problem. Currently
`compose({ surface })` accepts an Adapter-created Provider as a root. The realized Intent belongs
to the Adapter’s target Boundary, but execution starts from a Provider whose origin is the Adapter.
That overlays two different roles on the same Intent: public entry contract and unrealized dynamic
seam.

The shared decision is to require every Composition to declare a non-empty set of **Entry
Boundaries** and require every Surface root to be a Provider originated by one of those
Boundaries. Adapter-originated Providers remain valid in private wiring, but cannot be Surface
roots.

The recommended interface needs no currying:

```ts
const root = compose({
  entryBoundaries: [Orders, OtherBoundary],
  surface: {
    getOrder: GetOrderProvider,
    // ...
  },
  wiring: [
    FindOrderViaPostgresProvider,
    // ...
  ],
});
```

A TypeScript prototype verified that the single options bag preserves Entry Boundary literal IDs
and exact Surface Provider types, rejecting both an Adapter-originated root and a root belonging to
an unauthorized Boundary.

Currying remains justified only in the existing explicit-Params form, because there a generic is
supplied by the caller while later generics must be inferred:

```ts
compose<HostParams>()({
  entryBoundaries: [Orders],
  surface: { getOrder: GetOrderProvider },
  wiring: [FindOrderViaPostgresProvider],
});
```

## Review baseline

At review time:

- all 23 test files passed;
- all 189 tests passed;
- TypeScript typecheck passed;
- ESLint reported no errors and one warning for the unused `streamController` argument in
  `wireParentAbort`;
- the two lifecycle bugs below were reproduced with isolated runtime probes not present in the
  ordinary suite.

A green suite therefore does not contradict the findings: the relevant interactions are not
currently covered.

## What works well in the stream design

The findings are local correctness issues, not a rejection of the model.

### Modality is explicit

`unary | stream` is a Contract property. A stream is not modeled as a unary result whose success
value accidentally contains an `AsyncIterable`.

That keeps modality visible and checkable in:

- Adapter;
- Intent alias;
- `using` dependencies;
- Surface typing;
- `describePlan()`.

### Stream invocation and Provider lifetime are separate

A Provider instance may be owned by the Composition or the execution context, independently of
each stream invocation’s lifetime:

```text
Provider lifetime
  materialization → cache → Lifetime.onDispose

Stream invocation lifetime
  first next() → iteration → abort/return/completion → close
```

Unifying the two concepts would force recreating the Provider per stream or keeping
single-invocation resources open for the whole Provider lifetime.

### The public protocol is small

The Surface returns synchronously a cold, single-consumer
`AsyncIterable<InvocationOutcome<Item, Err>> & AsyncDisposable`:

- pull provides natural backpressure;
- expected errors are in-band and terminal;
- unexpected failures become terminal `unexpectedFailure` events ([ADR 0015](./adr/0015-boundary-error-totalization.md));
- the generator return value is not part of the public protocol;
- creating the iterable does not materialize the Provider or acquire resources;
- `break`, `return()`, async dispose, abort, natural completion, and terminal outcomes converge on
  the same close.

### Cancellation ownership is explicit

Every invocation receives a dedicated signal, subordinate to the execution-context signal and
distinct from `Lifetime.signal`. A stream can therefore be cancelled without cancelling siblings or
disposing the Provider that produced it.

### Abort closes acceptance; it does not transfer ownership

The optional host signal controls acceptance of new work without becoming owner of the execution
context:

- an already-aborted signal fails `openExecutionContext()` immediately;
- after open, abort prevents accepting new invocations;
- a new unary invocation rejects with `signal.reason` via `AbortSignal.throwIfAborted()`; that
  acceptance channel remains outside Intent `InvocationOutcome`;
- a cold stream created before abort but not yet started ends normally on first `next()`, without
  materializing Provider or source;
- already-accepted work receives the signal and remains responsible for cooperative cancellation;
- host abort does not call `dispose()`: the open context remains host-owned.

This distinction avoids confusing work cancellation with resource release.
`withExecutionContext()` still guarantees dispose in its `finally`; callers of
`openExecutionContext()` must explicitly dispose the handle even after abort.

## Correctness findings

### F1 — An already-aborted parent can lose source cleanup

**Priority: high.**

In `managed-async-iterator.ts`, `beginStart()` currently runs these steps in order:

```ts
phase = "starting";
startAttempted = true;
controller = new AbortController();
wireParentAbort(controller);

startPromise = Promise.resolve().then(() => start(controller.signal));
```

If the parent is already aborted, `wireParentAbort()` immediately calls `beginClose("abort")`. At
that moment `startPromise` is still `undefined`, so `runClose()` has nothing to await and moves the
managed iterable to `closed`.

Control then returns to `beginStart()`, which still creates and runs `startPromise`. The produced
iterator is assigned after close finished and never receives `return()`.

The isolated probe produced:

```text
next()       → { done: true, value: undefined }
final phase  → closed
return calls → 0
```

The scenario is realistic: a host signal can abort the execution context without disposing it; a
later call may then try to start a stream through a still-open context whose signal is already
aborted.

#### Required semantics

A stream started under an already-aborted parent must not materialize the Provider or start the
source. The managed iterable must close without acquiring an execution lease.

The race among signal check, listener registration, and `startPromise` assignment must also be
removed. Once start is accepted, close must await its outcome and call `return()` exactly once if
an iterator is produced.

#### Acceptance tests

- parent already aborted before first `next()` → `start` is not called;
- abort after start acceptance but before it resolves → the resulting iterator receives `return()`
  once;
- dispose and abort racing with start share a single close promise;
- after close, no residual leases, registrations, or materializations remain.

### F2 — Abort-driven cleanup errors become unhandled rejection

**Priority: high.**

The parent-signal listener currently starts close without observing the promise:

```ts
const onAbort = (): void => {
  void beginClose("abort");
};
```

`runClose()` correctly collects `inner.return()` and `onClosed()` failures, then rejects the close
promise. The issue is who owns and observes that rejection.

During context dispose, the current sequence is:

```text
ExecutionContext.dispose()
  → abort context signal
  → listener starts stream close
  → onClosed removes stream from registry and releases lease
  → close promise rejects
  → execution drain finishes
  → registry.closeAll() no longer sees the stream
  → ExecutionContext.dispose() resolves
  → Node observes unhandledRejection
```

An isolated probe confirmed simultaneously that:

- the Provider disposer ran;
- `ExecutionContext.dispose()` resolved successfully;
- Node emitted `unhandledRejection: stream cleanup failed`.

This violates the ownership model: a close started by the owner must be awaited by the owner, and
any failure must enter the dispose error matrix.

#### Required semantics

- no abort-created close promise may remain floating;
- the registry must retain enough settlement information for the owner to await every close it
  started, including streams in `starting` or `closing`;
- host abort without immediate dispose must not produce unhandled rejection;
- stream dispose, pending `next()`, and context dispose may observe the same close promise and the
  same possible rejection;
- a failure must not prevent release-once of the lease and registry bookkeeping.

The mechanism may be a registry-owned settlement record, an internal `closed` promise, or an
explicit channel for owner-driven close failures. The invariant matters more than the
representation: every owner-driven close must have a terminal outcome observed by the owner.

Observers of the same close promise are:

- close started by `iterator.return()` or stream async dispose → observed by the consumer;
- close started by context/root dispose → observed by owner dispose;
- close started by host abort alone → a later stream operation and context dispose may observe the
  same outcome; the internal listener must still prevent `unhandledRejection`.

#### Acceptance tests

- `inner.return()` fails during `ctx.dispose()` → `ctx.dispose()` rejects with that failure;
- the same scenario does not emit `unhandledRejection`;
- host abort closes the stream without disposing the context and without unhandled rejection;
- subsequent context dispose can observe the same rejection without duplicating cleanup;
- concurrent `iterator.return()`, async dispose, host abort, and context dispose do not duplicate
  cleanup or lease release.

### F3 — Propagating stream failure must not skip Provider disposers

**Priority: high as part of the F2 fix.**

The context currently runs:

```ts
await streams.closeAll();
await contextScope.dispose(...);
```

Today F2 often hides stream failures and the second operation still runs. When `closeAll()` starts
propagating them correctly, this sequence would skip every context-owned Provider disposer and
removal from `openContexts`.

Also `closeAll()` uses `Promise.all`: all promises start, but the result exposes only the first
rejection instead of composing all failures under Forma’s existing disposal rules.

#### Required semantics

Context dispose must always attempt, even after earlier failures:

1. close of every owned stream invocation;
2. every context-owned Provider disposer in LIFO order;
3. removal of the context from the `openContexts` registry;
4. aggregation of multiple failures via the existing `AggregateError` policy.

The already available `ProviderScope.dispose({ beforeDisposers, after })` interface expresses this
composition well:

- stream closing can happen in `beforeDisposers`;
- Provider disposers are still attempted;
- `after` always removes the context;
- errors are collected under the common error matrix.

Before using that structure, the registry must be fixed so `closeAll()` truly observes every
owner-driven close.

#### Acceptance tests

- stream cleanup fails, but every Provider disposer still runs;
- stream cleanup and one Provider disposer fail → both appear in `AggregateError`;
- multiple streams fail during cleanup → all failures are reported after every stream settles;
- the context is removed from `openContexts` after successful or failed cleanup;
- root dispose does not try to dispose again a failed context that still appears open.

### F4 — Minor implementation hygiene

`wireParentAbort(streamController)` does not use `streamController` and produces the only current
ESLint warning. It is not a correctness bug, but it also signals the F1 ambiguity: the function
receives a controller yet starts managed close directly.

The final implementation should use that argument in the chosen protocol or remove it.

## Directionality finding: Adapter as Surface root

### Current graph

The demo currently allows this shape:

```text
surface.watchOrders
        │
        ▼
WatchOrdersViaPostgresProvider
origin: Adapter "orders-postgres"
intent: Orders.WatchOrders
```

Intent identity belongs to `Orders` and the Adapter is correctly associated with that target
Boundary. However, Surface entries are Providers, not isolated Intents. Execution therefore starts
from an Adapter-originated Provider, not from a Provider owned by `Orders`.

The distinction matters because Forma already attributes different powers to the two origins:

- `Intent.provide.using(...)` may depend only on Intents of the same Boundary;
- `adapter(...).adapt(...).using(...)` may depend on Intents from any Boundary.

Allowing the second to be a root means starting the graph at the node with the greatest
cross-Boundary freedom. The same-boundary restriction remains locally true, but no longer governs
the starting point.

### Overlapping roles

In the direct form, `Orders.WatchOrders` simultaneously plays three roles:

1. public contract exposed by the Composition;
2. unrealized Intent used as a dynamic seam;
3. Intent realized directly by an external Adapter.

Runtime replaceability remains possible, but the ownership transition through `Orders`
disappears. No Orders Provider chooses, limits, transforms, or explicitly delegates toward that
seam. The Adapter effectively owns the public path while not owning the Intent Contract.

This is the architectural short-circuit:

```text
Current
Surface → Adapter realization of an Orders Intent

Desired
Surface → Orders realization → unresolved Orders Intent → Adapter realization
```

### Desired graph

The streaming example should distinguish the entry Intent from the dynamic seam:

```text
surface.watchOrders
        │
        ▼
Orders.WatchOrders
Provider origin: Boundary "orders"
        │
        ▼
Orders.WatchOrderEvents
unrealized internal Intent
        │
        ▼
Postgres or Memory Adapter
```

For example:

```ts
export const WatchOrders = Orders.stream("watchOrders").contract<OrderId, OrderEvent, WatchError>();

export const WatchOrderEvents = Orders.stream("watchOrderEvents").contract<
  OrderId,
  OrderEvent,
  WatchError
>();

export const WatchOrdersProvider = WatchOrders.provide
  .using({ events: WatchOrderEvents })
  .with(({ deps: { events } }) => {
    return (orderId, invocation) => events(orderId, invocation);
  });
```

The first realization can be a passthrough. Its value is not hidden implementation complexity, but
separating two architectural roles and preserving graph direction. Authorization, projection,
filtering, error mapping, deduplication, or stream composition then have an Orders-owned place
without changing the public contract or Adapter seams.

## Shared model: Entry Boundary

### Definition

An **Entry Boundary** is a Boundary explicitly authorized to own Surface roots for a given
Composition.

This does not imply one Composition per Boundary. The Composition still represents a closed graph
with its own runtime ownership and lifecycle and may cross many Boundaries. Entry Boundaries only
identify where public traversal may begin.

### Fundamental invariant

For every Surface alias `s`:

```text
provider(s).origin.kind = "boundary"
provider(s).origin.id ∈ composition.entryBoundaryIds
```

The inverse must also hold: every ID declared in `entryBoundaryIds` appears as the origin of at
least one Surface root. The declared set describes actual entries, not a potential allowlist.

Consequently a Composition cannot have an empty Surface: `entryBoundaries` is non-empty and every
declared Entry Boundary must own at least one root. A Composition with no public API is not the
Composition model Forma supports.

Consequences:

- a Provider originated by an authorized Entry Boundary is a valid root;
- a Provider originated by another Boundary is rejected;
- an Adapter-originated Provider is rejected even when its target Intent belongs to an Entry
  Boundary;
- an Entry Boundary with no Surface alias is rejected;
- Adapter-originated Providers remain valid in private `wiring`;
- every cross-Boundary path reachable from the Surface starts under explicit Boundary ownership.

### Why the target Boundary alone is not enough

Checking only `provider.intent.boundaryId` would accept the current example:
`WatchOrdersViaPostgresProvider.intent.boundaryId` is already `orders`.

Validation must also check Provider origin. Allowing a set of Intent Boundaries answers only “who
declared the Contract?”, not “where does execution start?”.

Entry Boundary validation answers both:

- the Contract belongs to an authorized Boundary;
- the root realization is owned by that Boundary, not by an Adapter.

### One Composition per Boundary is unnecessary

Creating a distinct Composition per Boundary would couple architectural partition to runtime
ownership and introduce unnecessary problems:

- nested execution contexts;
- duplicated composition-scoped Providers;
- signal and Params propagation across roots;
- dispose ordering among Compositions;
- intermediate public Surfaces used only to connect internal graphs.

The recommended rule is:

> One Composition per runtime/lifecycle ownership unit; an explicit non-empty set of Entry
> Boundaries per Composition.

A subsystem Composition may have a single Entry Boundary:

```ts
entryBoundaries: [Orders];
```

An application Composition may intentionally aggregate several:

```ts
entryBoundaries: [Orders, Billing, Identity];
```

Both may privately cross other Boundaries via registered Providers and Adapters.

## Interface design and TypeScript inference

### Question verified

The proposed curried form was:

```ts
compose([Orders, OtherBoundary])({
  surface: {
    /* ... */
  },
  providers: [
    /* ... */
  ],
});
```

The concern was that TypeScript might infer the Entry Boundary list too widely before validating
the Surface, losing the literal IDs required by the invariant.

### Verification method

A strict-mode TypeScript prototype was compiled that modeled:

- `Boundary<Id>` values with literal IDs;
- Boundary- and Adapter-originated Providers;
- the authorized ID union derived from the Entry Boundary tuple;
- a phantom-property diagnostic `AssertSurfaceRoots<Entries, Surface>`;
- the exact resulting Surface type.

These three forms were verified:

```ts
composeSingle({
  entryBoundaries: [Orders, Billing],
  surface: { getOrder: GetOrderProvider, getInvoice: GetInvoiceProvider },
});

composeTwoArgs([Orders, Billing], {
  surface: { getOrder: GetOrderProvider, getInvoice: GetInvoiceProvider },
});

composeCurried([Orders, Billing])({
  surface: { getOrder: GetOrderProvider, getInvoice: GetInvoiceProvider },
});
```

All three preserve exact Surface Provider types. All three reject:

- an Adapter-originated Provider used as a root;
- a Billing Provider when only `Orders` is declared as Entry Boundary.

The single-bag form works because Entry Boundaries are ordinary values. With a `const` generic,
TypeScript infers literal IDs and the exact Surface in the same call, then evaluates the
intersected assert. There is no partial generic application.

### Why Params currying is different

The current form remains justified:

```ts
compose<ExplicitParams>()({
  /* Surface and wiring inferred */
});
```

TypeScript does not allow supplying only the first generic and freely inferring the rest in the
same call. The first call captures the explicit Params type; the returned generic function infers
Surface and wiring from the value.

Entry Boundaries do not have this limit because they are inferred from runtime values, not
specified as explicit type arguments.

### Alternative comparison

| Form                                            | Type precision | Interface cost                          | Assessment                 |
| ----------------------------------------------- | -------------- | --------------------------------------- | -------------------------- |
| `compose({ entryBoundaries, surface, wiring })` | Preserved      | Single existing options bag             | Recommended                |
| `compose([boundaries], { surface, wiring })`    | Preserved      | New positional convention and overloads | Correct, but less explicit |
| `compose([boundaries])({ surface, wiring })`    | Preserved      | Extra call and another currying style   | Unnecessary                |
| `compose.boundaries(...).as({ ... })`           | Preserved      | New builder and intermediate object     | Unnecessary                |

A fluent form would be valuable only if the first stage needed reuse across Compositions or if
TypeScript required an inference barrier. Neither need appeared.

### Recommended public form

```ts
const root = compose({
  entryBoundaries: [Orders, Billing],
  surface: {
    getOrder: GetOrderProvider,
    getInvoice: GetInvoiceProvider,
  },
  wiring: [FindOrderViaPostgresProvider, LoadInvoiceViaPostgresProvider],
});
```

Keep the name `wiring`, not `providers`. The current array may contain both Providers and
`aliasIntent()` entries; calling it `providers` would be inaccurate and would couple this decision
to an independent breaking change.

The Entry Boundary list must be required and non-empty. Making it optional and inferring it from
the Surface would reject Adapter roots, but would not catch accidental exposure of an extra
Boundary — exactly one of the problems this proposal aims to solve.

### Type-signature sketch

The form can remain a single generic call:

```ts
type EntryBoundaries = readonly [Boundary<string>, ...Boundary<string>[]];

export function compose<
  const Entries extends EntryBoundaries,
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[] = [],
>(
  options: ComposeOptions<Entries, Surface, Wiring> &
    ComposeAsserts<Surface, Wiring> &
    AssertSurfaceRoots<Entries, Surface>
): CompositionRoot<Surface, InferredParamsFor<Surface, Wiring>>;
```

Diagnostics should report invalid aliases distinguishing the two causes:

```text
Surface alias "watchOrders" uses Adapter-originated Provider "orders-postgres".
Adapter Providers cannot be Composition roots.
```

```text
Surface alias "getInvoice" starts from Boundary "billing".
Declared Entry Boundaries: orders.
```

The same validation must exist at runtime for JavaScript callers, widened config, and casts.

## Required type-model changes

### Keep origin in the concrete Provider type

The current `Provider` type contains:

```ts
readonly origin: ProviderOrigin;
```

Every concrete Provider therefore exposes the whole union:

```ts
{ kind: "boundary"; id: string } | { kind: "adapter"; id: string }
```

The builder knows the precise origin, but the public return type erases it. Entry Boundary
validation cannot statically distinguish a Boundary root from an Adapter root until that
information is preserved.

The least invasive change is to append `Origin` to `Provider` generics:

```ts
export type Provider<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps = Record<string, never>,
  Policy extends LifetimePolicy = "auto",
  Params = void,
  Mode extends IntentModality = "unary",
  Origin extends ProviderOrigin = ProviderOrigin,
> = {
  // ...
  readonly origin: Origin;
};
```

Boundary builders must return:

```ts
Provider<
  /* existing generics */,
  { readonly kind: "boundary"; readonly id: BoundaryId }
>
```

Adapter builders must keep an equally precise Adapter origin. Making the Adapter ID a `const`
generic would improve diagnostics and `describePlan()`, even though preserving `kind: "adapter"`
is enough to reject a root.

Every conditional type that destructures `Provider` must be updated for the new final generic.
`AnyProvider` may erase it internally, but `Surface` must capture concrete Providers before the
assert extracts origin.

### Add Entry Boundaries to composition data

`ComposeOptions` must contain the precise Entry Boundary list. The compiler must derive the ID set
once and use it for Surface runtime validation.

Duplicate IDs should produce a clear diagnostic instead of being silently normalized. Intent
identity already treats Boundaries with the same ID as the same architectural identity; repeating
them adds no information and normally signals a declaration error.

### Make direction visible in `describePlan()`

The plan should expose at least:

```ts
{
  entryBoundaries: ["orders"],
  surface: [
    {
      alias: "watchOrders",
      intent: ["orders", "watchOrders"],
      origin: { kind: "boundary", id: "orders" },
    },
  ],
  providers: [/* existing lifetime descriptions */],
}
```

That makes the invariant inspectable in tests and lets tooling explain where the graph starts, not
only which Providers it contains.

## Required decision and documentation updates

The proposal changes the current domain model and partially supersedes ADR 0001, which explicitly
allows an Adapter Provider to be registered in `compose({ surface, wiring })`.

Implementation therefore needs a new ADR recording these decisions:

- Adapter remains a first-class architectural origin peer of Boundary;
- Adapter-originated Providers are valid private realizations, but not Surface roots;
- every Composition declares its Entry Boundaries;
- Surface roots must be owned by the declared Entry Boundaries;
- Composition ownership scope need not coincide one-to-one with a Boundary.

The Glossary must introduce **Entry Boundary** and refine existing definitions:

- **Boundary** owns Intent Contracts and may be authorized as a Composition entry;
- **Entry Boundary** is explicitly authorized to own Surface roots;
- **Surface** contains only aliases of Providers owned by declared Entry Boundaries;
- **Adapter** realizes dynamic seams behind a Boundary-owned path and cannot be a Surface root;
- **Composition** owns a closed graph, its lifecycle, and an explicit non-empty set of Entry
  Boundaries.

README and demo must consistently use the new `ComposeOptions` shape.

## `forma-demo` migration

The unary path already shows the desired direction:

```text
Surface
  → Orders.GetOrder Provider
  → Orders.FindOrder unresolved Intent
  → Memory/SQLite Adapter
```

The streaming path must be brought to the same model:

```text
Surface
  → Orders.WatchOrders Provider
  → Orders.WatchOrderEvents unresolved Intent
  → Memory/SQLite Adapter
```

Both compositions declare:

```ts
entryBoundaries: [Orders];
```

`WatchOrderEventsViaMemoryProvider` and `WatchOrderEventsViaSqliteProvider` realize
`WatchOrderEvents` in `wiring`. The Surface exposes the same Orders-originated
`WatchOrdersProvider` in both variants.

## Implementation plan

Lifecycle fixes and Entry Boundaries are independent and should land in separate changes.

### Phase 1 — Streaming lifecycle correctness

1. Reject opening an execution context when the host signal is already aborted.
2. Block new unary invocations after abort, propagating `signal.reason`.
3. Apply no-start / no-materialization semantics to streams with an already-aborted parent.
4. Reorder start and abort registration so every accepted start is awaited by close.
5. Give the registry an observable terminal outcome for owner-driven closes.
6. Make `closeAll()` await every stream and aggregate every failure.
7. Compose stream close with the context Provider-scope dispose, guaranteeing Provider disposers
   and final context removal.
8. Add the race and error-matrix tests listed in F1–F3.
9. Remove the ESLint warning in the final abort protocol.

### Phase 2 — Precise Provider provenance

1. Add the final `Origin` generic to `Provider`.
2. Propagate precise Boundary and Adapter origins through both builder families.
3. Preserve origin through `AnyProvider`, Surface inference, wiring helpers, and conditional types.
4. Add isolated type tests for builder chains, lifetime modifiers, and `.using(...)`.

### Phase 3 — Entry Boundary validation

1. Add required non-empty `entryBoundaries` to `ComposeOptions`.
2. Add `AssertSurfaceRoots<Entries, Surface>` with alias diagnostics.
3. Add equivalent runtime validation before graph compilation.
4. Reject duplicate Entry Boundary IDs and Boundaries declared but not represented on the Surface.
5. Extend `defineComposition` without introducing new currying or fluent builders.
6. Keep `compose<ExplicitParams>()({...})` working with the new bag.
7. Extend `describePlan()` with Entry Boundaries and root provenance.

### Phase 4 — Migration and documentation

1. Migrate tests and README examples to explicit Entry Boundaries.
2. Separate the demo’s stream entry Intent from the stream dynamic-seam Intent.
3. Add the new ADR and mark ADR 0001’s Surface clause as superseded.
4. Update the Glossary.
5. Add a migration note: every `compose` call changes, and Adapter Surface roots become invalid.

## Recommended decisions

1. Fix the two confirmed races before considering streaming support complete.
2. Compose cleanup failures without ever skipping later owners.
3. Treat an Adapter Surface root as an architectural short-circuit and reject it.
4. Require every Composition to declare one or more explicit Entry Boundaries.
5. Require exact correspondence between declared Entry Boundaries and Boundaries actually exposed,
   while still allowing the Composition to privately cross other Boundaries.
6. Keep the single options-bag interface by adding `entryBoundaries`.
7. Do not introduce currying or fluent builders for Entry Boundary inference.
8. Keep the name `wiring`, because the list is not only Providers.
9. Preserve provenance in the type model so compile time and runtime apply the same rule.
10. Record the architectural decision in an ADR and update the Glossary during implementation.
