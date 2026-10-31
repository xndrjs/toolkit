# 0012. Streaming Intents — modality, ownership, managed iterator

## Status

Accepted (amended: pre-abort, transactional start, and cleanup-error ownership semantics)

## Context

Unary Intent operations complete during a single surface call. An async generator returns an
iterator immediately while the body may run far longer than that call. Treating
`AsyncIterable<Result<…>>` as a unary success value would release the execution-context lease too
early, leave cancellation and cleanup to the caller, and hide modality from
`describePlan()` / Adapter / alias checks.

[streaming-intents.md](../streaming-intents.md) recorded a grilled target model (“Decisioni
chiuse”). Fase 0 validated an isolated `ManagedAsyncIterator` spike
(`src/execution/managed-async-iterator.ts`, formerly the Fase 0 spike) — state machine, cold single-consumer iterable,
`[Symbol.asyncDispose]`, terminal `Err` enforcement, and reuse of the existing disposal error
matrix — without changing the `compose` runtime. This ADR freezes those decisions for core
integration.

## Decision

### Contract modality

- Intent modality is `unary | stream`, fixed on the **Contract**.
- Identity stays `(boundaryId, intentName)`.
- Public syntax: `boundary.stream(name).contract<Input, Item, Err>()`; `boundary.intent` remains
  unary.
- Do not unify unary and stream behind a return-type union or
  `Success = AsyncIterable<Item>` on a unary Intent.

### Surface and protocol

- Stream surface returns synchronously
  `AsyncIterable<Result<Item, Err>> & AsyncDisposable` (not a public `AsyncIterableIterator`).
- Cold + single-consumer: first iteration takes ownership; a second iteration of the same value
  fails clearly; two surface calls are independent streams.
- Protocol: `ok` emits an item; `err` is an expected failure and is **terminal** (wrapper calls
  `return()` on the source after the first `err`); iterator completion is normal end; `throw` is
  unexpected.
- Generator return values are not part of the public protocol.

### Invocation model

- `StreamOperation<Input, Item, Err> = (input, invocation) => AsyncIterable<Result<Item, Err>>`
  with `StreamInvocation = { readonly signal: AbortSignal }` in v1.
- Unary operations stay `(input) => Result | Promise<Result>` — no invocation bag on unary in the
  first ship.
- `StreamInvocation.signal` is per stream invocation, subordinate to the execution-context signal,
  and distinct from Provider `Lifetime.signal`.

### Ownership and lifecycle

- Each stream invocation is owned by the **execution context** that opened it (lease, active
  registry, cleanup).
- Provider effective lifetime (materialize / cache / `Lifetime`) stays independent of modality;
  lifetime inference ignores modality.
- **Execution lifecycle ≠ `ProviderScope`:** separate invocation leases (unary + stream registry)
  from Provider materialization/cache before integrating the stream registry (prerequisite phase).
- Lazy start: creating an iterable without iterating does not materialize, lease, register, or open
  resources; the first `next()` performs those steps.
- If the parent signal is already aborted at the first `next()`, iteration completes normally
  without materializing the Provider or starting the source.
- Consumer `break` / `return()` / `[Symbol.asyncDispose]`, context dispose, and root dispose close
  active streams (abort per-stream signal → `return()` → await `finally` → release-once).
- A direct consumer `iterator.throw(error)` is terminal: Forma performs the same managed close,
  does not forward `throw()` to the source, and rethrows the consumer error after cleanup. A source
  cannot catch that error to resume a stream whose consumer has terminated it.
- Host abort on the context signal propagates to invocation signals and must unblock cooperative
  I/O; it does **not** auto-`dispose()` the context (abort ≠ dispose; same as ADR 0008).
- No hang-timeout in core v1 for non-cooperative generators.

### Managed iterator (spike → integration shape)

- Per-stream state machine: `idle | starting | active | closing | closed`.
- Start acceptance is transactional. The registry entry and execution lease are acquired before
  source scheduling. If the acceptance hook throws, the source is never invoked, the close state
  machine releases partial ownership exactly once, and the acceptance error remains primary.
- After acceptance, the canonical `startPromise` exists before wiring parent abort. A concurrent
  close can therefore always await start and call `return()` on an iterator produced by the race.
- Close is idempotent; concurrent `return` / dispose share one close promise.
- A close started by parent/context abort is observed immediately to avoid a floating rejection,
  while its canonical promise remains available to the stream consumer and owning context.
- Context dispose waits for every owner-started close, attempts every Provider disposer even when
  stream cleanup fails, and aggregates all cleanup failures.
- Cleanup error composition **reuses** disposal helpers:
  - multiple cleanup failures → `AggregateError` (`throwIfDisposerErrors`);
  - iteration/start failure + cleanup failure → `SuppressedError(cleanup, iteration)`
    (`throwAfterCallbackAndCleanup`).
  - acceptance failure + rollback failure follows the same `SuppressedError(cleanup, acceptance)`
    rule.
- Multicast, replay, push/Observable, duplex, reconnect, and transport framing stay out of core.

### Provider, Adapter, alias, plan

- Same `.provide` / `.adapt` builders; operation shape follows Contract modality.
- Adapter preserves modality; unary↔stream Intent alias fails at compile time.
- `using` a Stream Intent resolves to `StreamOperation`, never an open iterator.
- `describePlan()` exposes `mode: "unary" | "stream"` on **all** registered Intents (surface and
  wiring).

## Consequences

- Stream support is a Contract modality plus execution-owned invocation lifetime — not a return-type
  widening of unary.
- Execution lifecycle is separate from `ProviderScope` (invocation leases / stream registry vs
  Provider materialize/cache/`Lifetime`).
- Remote Adapter / SSE / WebSocket can share the same `AsyncIterable<Result<…>>` + `return`/abort
  protocol without core exceptions; transport policy stays outside Forma (optional spike, not
  required for the core ship).
- The managed iterator is not a public export; it lives under `execution/` and is used by the
  stream registry / surface wrapper.
- Ownership and cancellation are documented for callers via README, Glossary (**Stream
  invocation**), [streaming-intents.md](../streaming-intents.md), and the `WatchOrders` example in
  `apps/forma-demo`.
