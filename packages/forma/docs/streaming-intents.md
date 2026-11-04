# Streaming Intent and multi-yield operations

> Status: agreed target model (grill); core integrated (Phases 0–4);
> spike + registry + surface + cancel/errors + Adapter/alias/`describePlan`;
> `WatchOrders` demo in `apps/forma-demo`; decisions made binding by
> [ADR 0012](./adr/0012-streaming-intents.md).
> Decisions under “Closed decisions” are not reopened without a new trade-off.
> Phase 5 (remote Adapter) remains outside the first core ship.
> Event protocol amended by [ADR 0015](./adr/0015-boundary-error-totalization.md)
> (`InvocationOutcome` replaces `Result` / `ok` / `err`).
>
> Scope: pull-based stream support via `AsyncIterable` / async generator. This document does not
> propose dynamic dependency resolution via `yield`.

## Executive summary

Async generators fit Forma well when `yield`s belong to the operation and represent stream
elements:

```ts
const WatchOrdersProvider = WatchOrders.provide.with(
  () =>
    async function* (input, invocation) {
      const subscription = await subscribe(input, { signal: invocation.signal });

      try {
        for await (const event of subscription) {
          yield success(event);
        }
      } finally {
        await subscription.close();
      }
    }
);
```

Adding `AsyncIterable<InvocationOutcome<...>>` to today’s operation return type is not enough. A
unary operation has a terminal completion observed during a single call; a stream immediately
returns an iterator that may stay active far longer than the call that created it. Forma must
therefore explicitly own the streaming invocation lifetime.

The agreed direction is:

- introduce modality `unary | stream` on the **Contract** (identity stays `(boundaryId, intentName)`);
- keep the graph, Provider lifetime, and lifetime inference unchanged (independent of modality);
- add a stream invocation lifetime owned by the execution context;
- return from the surface a lazy, cold, single-consumer `AsyncIterable` (with `AsyncDisposable`);
- close active streams when the consumer stops, the execution context is disposed, or the related
  signal is aborted (host abort ≠ automatic dispose);
- use `InvocationOutcome<Item, Err>` as the event protocol, with `expectedError` / `unexpectedFailure` /
  `cancelled` terminal and enforced by the wrapper ([ADR 0015](./adr/0015-boundary-error-totalization.md));
- leave transport, reconnect, multicast, and runtime schema to modules built on top of the core.

This extension is especially useful for database cursors, subscriptions, filesystem watches,
Server-Sent Events, WebSockets, and fullstack remote Adapters.

## Current context

Forma models a unary operation as:

```ts
type IntentOperation<Input, Success, Err> = (
  input: Input
) => InvocationOutcome<Success, Err> | Promise<InvocationOutcome<Success, Err>>;
```

The surface can hold an execution-context lease for the whole invocation:

```text
enter → materialize Provider → invoke operation → await result → leave
```

That ensures dispose waits for already-accepted work. Provider and operation have different
responsibilities:

- the Provider is materialized once for its effective lifetime;
- the operation may be invoked many times;
- `Lifetime.onDispose` belongs to the Provider instance;
- the surface lease belongs to the single invocation.

An async generator changes the last point. Calling a generator function returns an iterator
immediately; the body runs only on the first `next()`:

```ts
const stream = operation(input); // does not consume the stream
```

If Forma released the lease right after this line, the execution context could dispose Providers
while the stream was still using them.

## Fundamental distinction

There are at least three possible meanings of `yield`; only one is in scope.

### Operation yield: in scope

Each `yield` is a stream element:

```ts
async function* watch(input, invocation) {
  yield success(firstEvent);
  yield success(secondEvent);
}
```

### Provider factory yield: out of scope

It is not proposed that a Provider factory produce multiple operations or instances through
successive yields. The Provider still materializes a single operation, sync or async.

### Intent-as-effect yield: out of scope

A form like this is not proposed:

```ts
function* provider() {
  const db = yield ConnectionIntent;
}
```

Dynamic dependency resolution would weaken the closed graph, cycle detection, lifetime inference,
`describePlan()`, and type-level checks. It would be a different effect system from Forma’s current
thesis.

## Goals

1. Represent pull-based streams with standard JavaScript `AsyncIterable` and `AsyncIterator`.
2. Preserve the static distinction between unary and streaming operations.
3. Keep the closed graph and all current Composition guarantees.
4. Make the stream a resource owned by the execution context.
5. Propagate cancellation to per-invocation work, even when the Provider is composition-effective.
6. Guarantee cleanup on completion, error, `break`, dispose, and abort.
7. Keep both Provider materialization and stream start lazy.
8. Hide lifecycle complexity behind the normal `AsyncIterable` interface.
9. Leave remote transport integration open without introducing it in the core.

## Initial non-goals

- push-based streams or an Observable/Rx system in the core;
- duplex streams;
- multicast, replay, or automatic sharing across consumers;
- reconnect and retry policy;
- configurable batching and buffering;
- dynamic dependency resolution via generators;
- serialization or runtime schema;
- immediate introduction of named or nested scopes;
- distinct support for sync generators: the baseline always uses `AsyncIterable`.

## Proposed public model

### Explicit Intent modality

Unary and streaming must be distinguishable in the Intent type:

```ts
const GetOrder = Orders.intent("getOrder").contract<OrderId, Order, GetOrderError>();

const WatchOrders = Orders.stream("watchOrders").contract<
  WatchOrdersInput,
  OrderEvent,
  WatchOrdersError
>();
```

Agreed syntax: `boundary.stream(name).contract<...>()` (and `boundary.intent` remains unary).
Modality is fixed on the **Contract**, not on identity and not inferred from the return type at
runtime.

An implicit union should be avoided:

```ts
// Not proposed
type OperationResult<S, E> =
  | InvocationOutcome<S, E>
  | Promise<InvocationOutcome<S, E>>
  | AsyncIterable<InvocationOutcome<S, E>>;
```

With that union the caller would not know statically whether to use `await` or `for await`.

### Stream operation

Forma target (v1):

```ts
type StreamInvocation = {
  readonly signal: AbortSignal;
};

type StreamOperation<Input, Item, Err> = (
  input: Input,
  invocation: StreamInvocation
) => AsyncIterable<InvocationOutcome<Item, Err>>;
```

`StreamInvocation` in v1 exposes only `signal` (no metadata). Unary stays
`(input) => InvocationOutcome | Promise<InvocationOutcome>` — no second argument in v1.

`StreamInvocation.signal` is distinct from `Lifetime.signal`:

- `Lifetime.signal` belongs to the Provider instance;
- `StreamInvocation.signal` belongs to the single stream invocation;
- every invocation signal is subordinate to the execution-context signal;
- stopping a single stream aborts its invocation without aborting the whole context.

The distinction is required for composition-effective Providers: the instance may live as long as
the root, but every stream it produces must still end with the context that invoked it.

### Surface

The surface distinguishes unary and streaming:

```ts
const result = await execution.surface.getOrder(input);

const stream = execution.surface.watchOrders(input);
for await (const event of stream) {
  // ...
}
```

The stream surface operation returns an `AsyncIterable` synchronously (not a public
`AsyncIterableIterator`). The internal wrapper handles `return()`; the typical consumer uses
`for await` / `break`. The iterable also implements `[Symbol.asyncDispose]` on the same cleanup
path. Provider materialization and stream opening happen on the first `next()`. Returning
`Promise<AsyncIterable<...>>` would force a less natural form:

```ts
// Avoid
for await (const event of await execution.surface.watchOrders(input)) {
}
```

Public guarantees: cold + single-consumer:

- the first iteration takes ownership;
- a second iteration of the same value fails clearly;
- two surface calls produce two independent streams;
- multicast/replay are not in the core; any under-the-hood I/O sharing remains a Realization
  detail, not Forma API.

## Event and error semantics

Agreed protocol ([ADR 0015](./adr/0015-boundary-error-totalization.md)):

```ts
AsyncIterable<InvocationOutcome<Item, Err>>;
```

Rules:

- `success(item)` emits an element;
- `expectedError` represents an expected failure and is terminal;
- `unexpectedFailure` represents an unexpected failure and is terminal (source throw/rejection at start
  or `next()` becomes a terminal `unexpectedFailure` event — `next()` does not reject for that failure);
- `cancelled` is terminal;
- iterator completion represents normal end;
- no element is allowed after a terminal kind;
- cleanup errors reuse Forma’s existing disposal matrix (`SuppressedError` / `AggregateError`
  where already applicable) — no stream-only ad hoc policy;
- every owner-started close keeps an observable outcome: context dispose waits for all closes,
  still attempts Provider disposers, and aggregates multiple failures;
- in v1 there is no timeout if a generator ignores cancellation and never completes `return()`:
  rely on abort + cooperation; any hang-timeout remains host policy.

The wrapper **enforces** terminal kinds: after the first `expectedError` / `unexpectedFailure` / `cancelled` it
calls `return()` on the inner iterator so later yields are not observable.

The generator’s final return value is not used to represent a result: `for await` does not expose
it ergonomically to the consumer.

## Ownership and lifecycle

### Two distinct lifetimes

```text
Provider effective lifetime
└── zero or more stream invocation lifetimes
```

Provider lifetime governs:

- factory and operation instance;
- cache and in-flight materialization;
- resources registered with `Lifetime.onDispose`.

Stream invocation lifetime governs:

- iterator;
- single-subscription signal;
- resources opened inside the generator function;
- execution-context lease;
- cleanup on completion or cancellation.

A resource shared across invocations belongs to the Provider. A subscription, cursor, or reader
created for a single input belongs to the stream.

### Lazy start

Creating a stream without iterating it must not:

- materialize the Provider;
- acquire a lease;
- register an active stream;
- open resources.

The first `next()` atomically:

1. checks that the execution context is still open;
2. takes the lease;
3. registers the active stream;
4. creates the per-stream `AbortController` linked to the context signal;
5. materializes the Provider;
6. invokes the StreamOperation;
7. forwards `next()` to the inner iterator.

A race between first `next()` and dispose must produce a single outcome: stream accepted then
closed, or rejection because the context is no longer open.

### Natural completion

When the inner iterator completes:

1. it is removed from the active-stream registry;
2. the per-stream controller is aborted/closed;
3. the lease is released exactly once.

### Consumer interruption

When the consumer runs `break`, `return()`, or abandons via an error in the loop, the wrapper:

1. aborts the per-stream signal;
2. calls `return()` on the inner iterator;
3. awaits the generator `finally`;
4. releases registration and lease.

`return()` must be idempotent from the wrapper’s point of view.

### Execution-context dispose

Dispose must avoid deadlock with infinite streams. It cannot passively wait for streams to end.

Proposed order:

```text
mark context disposing
→ abort context signal
→ prevent new invocations
→ abort + return() all active streams
→ wait stream cleanup
→ wait already-accepted unary invocations
→ dispose context-owned Providers
→ context disposed
```

This requirement likely needs separating invocation lifecycle from `ProviderScope`. Today the
Provider scope also owns surface-call leases; for streaming it is clearer to introduce an
execution lifecycle that owns unary invocations and the stream registry, leaving Provider scope
with materialization and Provider resources.

### Root dispose

The current order remains valid:

```text
root disposing
→ close all execution contexts (including active streams)
→ dispose composition-effective Providers
→ root disposed
```

### Host abort

The signal passed to `openExecutionContext` still flows into the context signal. Abort:

- fails opening immediately if the signal is already aborted;
- aborts all derived invocation signals;
- blocks new work: a unary rejects with `signal.reason`, while a cold stream not yet started
  completes without materialization;
- leaves already-accepted work in cooperative cancellation;
- must unblock cooperative I/O inside streams;
- does **not** automatically start context `dispose()` (abort ≠ dispose; consistent with ADR 0008).

With `withExecutionContext`, the `finally` dispose still closes active iterators.

## Active stream registry

An internal deep module with a small interface is needed, for example:

```ts
type StreamRegistry = {
  open<T>(start: (signal: AbortSignal) => AsyncIterator<T>): AsyncIterableIterator<T>;
  closeAll(): Promise<void>;
};
```

The final shape may differ, but the module must hide:

- `idle | starting | active | closing | closed` state of each wrapper;
- single-consumer enforcement;
- context and per-stream AbortController;
- `next` forwarding and managed close for `return` / `throw`; consumer-side `throw` is terminal,
  is not forwarded to the source, and rethrows the error after cleanup;
- active registration;
- release-once of the lease;
- concurrent closes;
- error composition;
- races among start, completion, and context dispose.

The execution context should not directly manipulate sets of iterators, controllers, and promises.

## Provider, Adapter, and alias

### Provider

A Stream Provider produces a `StreamOperation`, not an iterator directly. Same ergonomic path
`.provide.with` / Adapter `.adapt`: the operation type is driven by Contract modality, without a
second DSL. The same operation instance may create multiple independent iterators:

```ts
const WatchOrdersProvider = WatchOrders.provide.with(
  ({ deps }) =>
    async function* (input, invocation) {
      // a new invocation for every surface call
    }
);
```

Provider lifetime inference does not change: it depends on the dependency graph, not Intent
modality.

`using` admits stream Intents: the materialized dependency is the `StreamOperation` (iterable
factory), not an already-open iterator. Opening a stream remains a new invocation (surface
wrapper, or a Realization footgun if done outside the registry).

### Adapter

`Adapter.adapt()` must preserve the target Intent’s modality:

- unary Intent → unary Provider builder;
- Stream Intent → stream Provider builder.

A remote Adapter may produce an async iterator that decodes events from a transport.

### Intent alias

Aliases are allowed only between Intents with compatible modality and contract:

- unary → unary;
- stream → stream;
- same Input, Item/Success, and Err under existing structural rules.

Unary → stream and stream → unary must fail at compile time.

## Plan and introspection

`describePlan()` exposes modality (`mode: "unary" | "stream"`) on **all** registered Intents
(surface and wiring), not only the surface:

```ts
{
  intent: ["orders", "watchOrders"],
  mode: "stream",
  origin: { kind: "boundary", id: "orders" },
  lifetime: { declared: "auto", effective: "context" }
}
```

Modality is a Contract property, not a Provider property. Making it visible helps:

- graph visualization;
- transport manifest;
- architecture tests;
- finding private streams as well;
- future checks on composition-effective streams.

The plan describes static capabilities; active iterators are runtime state and do not belong in
the immutable `describePlan()` result. Any runtime inspection should have a separate interface.

## Fullstack implications

The shape fits a remote Adapter:

```text
Server Stream Intent
→ AsyncIterable<InvocationOutcome<Event, Err>>
→ SSE / WebSocket / streamed HTTP
→ Client remote Adapter
→ AsyncIterable<InvocationOutcome<Event, Err>>
```

Forma core should define only iterator ownership and protocol. A separate transport module
governs:

- runtime schema and serialization;
- event framing;
- reconnect and resume tokens;
- heartbeat;
- network-error mapping;
- transport authentication and authorization;
- backpressure available on the chosen transport.

Cancellation must propagate in both directions:

```text
consumer break / context dispose
→ client iterator.return()
→ transport cancel
→ server iterator.return() + abort
→ generator finally
```

A fullstack prototype is useful for validation but is not part of the first core increment.

## Alternatives considered

### `Success = AsyncIterable<Item>` on a unary Intent

```ts
Intent<Input, AsyncIterable<Item>, Err>;
```

Advantage: no new Intent kind.

Problems:

- Forma does not recognize that success carries a long lifecycle;
- the execution context releases the lease too early;
- cancellation and active-stream ownership remain the caller’s responsibility;
- `Err` can describe only startup, not expected errors during the stream;
- `describePlan()` cannot distinguish modality.

Possible as a manual escape hatch, but it offers no streaming guarantees.

### Union of unary result and stream

Reduces declared types, but moves branching onto every caller and makes the surface interface less
deep. Rejected as the initial direction.

### Promise of AsyncIterable

Simplifies async materialization, but worsens usage and artificially separates “open” from
“iterate”. A lazy iterable can hide both behind the first `next()`.

### Generator terminal return value

`for await` does not expose the return value ergonomically. Using a yielded terminal
`InvocationOutcome` is more compatible with the normal consumption protocol.

### Observable in the core

Observables solve important cases, especially push and multicast, but would introduce a
non-standard protocol and extra policy. An Adapter can convert between Observable and
AsyncIterable without imposing the dependency on Forma.

## Development plan

### Phase 0 — Isolated spike + ADR

Goal: validate the state machine and TypeScript ergonomics against the **Closed decisions**,
without changing the main runtime.

- build an experimental `ManagedAsyncIterator` wrapper (including `[Symbol.asyncDispose]`);
- verify `next`, `return`, terminal `throw`, abort, and concurrent cleanup;
- verify real behavior of async generators blocked on I/O;
- verify terminal-kind enforcement and reuse of the disposal error matrix;
- record the integration ADR only after the spike (no empty ADR beforehand).

Exit criterion: state machine and error matrix documented and tested; ADR aligned with Closed
decisions.

### Phase 1 — Type-level model

- add modality to Intent;
- introduce `StreamOperation`, `StreamInvocation`, and Stream Provider;
- correctly derive unary and stream surface operations;
- preserve modality in Adapter and alias;
- reject cross-modality aliases;
- keep Params and lifetime inference unchanged;
- add compile-time tests through the public interface.

Exit criterion: no change to unary behavior and stable inference.

### Phase 2 — Separate execution lifecycle (binding prerequisite)

Prerequisite before the stream registry: without this seam, lease and materialize stay tangled.

- separate invocation leases from `ProviderScope`;
- introduce execution-context state that rejects new work after `disposing`;
- keep existing unary behavior on the new execution lifecycle;
- test concurrent disposal and root backstop before adding streams.

Exit criterion: all existing unary tests green without special compatibility.

### Phase 3 — Stream registry and surface wrapper

- implement the `StreamRegistry` / managed iterator module;
- create lazy stream surfaces (`AsyncIterable` + `AsyncDisposable`);
- materialize the Provider on first `next()`;
- create and propagate the per-stream signal;
- register and close active streams;
- enforce terminal outcomes in the wrapper;
- compose iteration and cleanup errors with the existing disposal matrix;
- integrate context and root dispose.

Exit criterion: no resource or lease remains active after every terminal path.

### Phase 4 — Plan, diagnostics, and documentation

- add `mode` to `describePlan()`;
- document unary vs stream lifecycle;
- add a `WatchOrders` example to `forma-demo`;
- add diagnostics for incompatible modalities;
- update README, glossary, and related ADRs.

Exit criterion: a user can understand ownership and cancellation without knowing the internal
runtime.

**Status:** completed — `describePlan().mode`, README / Glossary / ADR 0012, and
`apps/forma-demo` (`WatchOrders` on both Adapters, full consume + early `break`).

### Phase 5 — Remote Adapter spike

Outside the initial core, but useful to validate the model:

- transport a Stream Intent with SSE or WebSocket;
- propagate `return()` and abort client → server;
- use an explicit runtime schema;
- verify expected error, disconnect, and server cleanup;
- compare local and remote behavior through the same interface.

Exit criterion: the remote Adapter needs no exceptions to the core model.

## Minimum test matrix

### Start and consumption

- creating without iterating does not materialize the Provider;
- the first `next()` materializes once;
- multiple `next()` produce multiple elements;
- natural completion releases lease and registration;
- two surface calls produce independent streams;
- a second iteration of the same stream fails clearly.

### Cancellation

- `break` and `[Symbol.asyncDispose]` call `return()` and the generator `finally`;
- explicit `return()` is idempotent;
- context dispose closes all active streams;
- root dispose closes context, streams, then root-owned Providers;
- host abort reaches `StreamInvocation.signal` without auto-disposing the context;
- parent already aborted at first `next()` does not materialize Provider or source;
- cancelling one stream does not abort the others or the context;
- streams from composition-effective Providers still use the per-context invocation signal.

### Errors

- `expectedError` / `unexpectedFailure` / `cancelled` are emitted once and terminate (wrapper enforce);
- yield after a terminal kind is not observable;
- throw before the first yield becomes a terminal `unexpectedFailure` and cleans up;
- throw after several yields becomes a single terminal `unexpectedFailure` and cleans up;
- cleanup failure is propagated;
- cleanup failure from host/context abort does not become `unhandledRejection` and remains
  observable from the subsequent context dispose;
- every cleanup is attempted and multiple failures are aggregated;
- iteration failure + cleanup failure reuses dispose error composition;
- Provider materialization failure does not leave a residual active stream.

### Concurrency and races

- dispose during the first `next()`;
- dispose during a blocked `next()`;
- concurrent `return()` share the close;
- concurrent completion and context dispose release once;
- multiple streams on the same Provider do not interfere;
- concurrent unary invocations and streams are both drained.

### Types and composition

- unary surface requires `await` and stream surface supports `for await` / `await using`;
- Stream Provider satisfies only Stream Intent; same `.provide` / `.adapt`;
- `using` a Stream Intent resolves to `StreamOperation`;
- Adapter preserves modality;
- cross-modality alias is rejected;
- closed graph and lifetime inference stay unchanged;
- `describePlan()` reports `mode` on all registered Intents.

## Closed decisions

Agreed target (grill). Validated by the Phase 0 spike; binding for the core via
[ADR 0012](./adr/0012-streaming-intents.md). Reopen only with an explicit new trade-off.
Event algebra amended by [ADR 0015](./adr/0015-boundary-error-totalization.md).

1. **Syntax:** `boundary.stream(name).contract<...>()`; `boundary.intent` remains unary.
2. **Surface type:** `AsyncIterable<InvocationOutcome<Item, Err>>` (+ `[Symbol.asyncDispose]`);
   not a public `AsyncIterableIterator`.
3. **Terminal kinds:** enforced in the wrapper (`return()` after the first
   `expectedError` / `unexpectedFailure` / `cancelled`).
4. **`StreamInvocation` v1:** only `{ signal: AbortSignal }`.
5. **Unary v1:** unchanged — no invocation bag on unary in the first ship.
6. **Host abort:** propagates signals; does not start context `dispose()` (abort ≠ dispose).
7. **Error matrix:** reuses existing disposal composition (`SuppressedError` / `AggregateError`
   where already used); documented and tested in the spike.
8. **Hang / non-cooperation:** no timeout in core v1.
9. **Cold + single-consumer:** public core guarantee; multicast/replay out of scope; internal I/O
   sharing = Realization detail.
10. **`describePlan()`:** `mode` on all registered Intents (surface + wiring).
11. **Modality:** on the Contract; identity stays `(boundaryId, intentName)`.
12. **Ownership:** every stream invocation is owned by the execution context.
13. **Execution lifecycle ≠ `ProviderScope`:** prerequisite (Phase 2) before the registry.
14. **`using`:** Stream Intent allowed; dep = `StreamOperation`, not an open iterator.
15. **Builder:** same `.provide` / `.adapt`; operation shape from modality.

## Overall acceptance criteria

The feature is ready when:

- unary behavior and compatibility remain unchanged;
- modality is known statically on Intent, Provider, Adapter, alias, and surface;
- no stream outlives its execution context;
- context and root dispose cannot passively block on cooperative infinite streams;
- every terminal path runs cleanup and release exactly once;
- a composition-effective Provider can produce correctly context-owned streams;
- the consumer uses the standard `for await` / `await using` protocol;
- `describePlan()` makes modality inspectable on all registered Intents;
- a remote Adapter can preserve the same interface without core changes.

## Assessment

Stream Intents strengthen Forma’s thesis: Composition does not only describe how to build
operations — it governs ownership and lifecycle of exposed capabilities. The value is not adding
generator syntax; it is hiding cancellation, cleanup, and races behind a small standard interface.

The feature deserves incremental development because it makes a new lifetime level explicit. If
implemented as a simple return-type union, it would weaken current guarantees. Treated instead as
Contract modality with stream-invocation ownership on the execution context, it coherently opens
local streaming, subscriptions, and fullstack remote Adapters.
