# 0004. Root and execution-context lifecycle state machines

## Status

Accepted

## Context

Execution contexts used a boolean `contextDisposed` flag and returned immediately on a second `dispose()`. The composition root had no disposal phase at all: after `root.dispose()` callers could open new contexts, rematerialize composition-lifetime providers, and race concurrent dispose calls so one caller finished while another still ran cleanups. Materialization checked the context flag even for composition-lifetime providers, so closing one context could abort a shared factory. Late `Lifetime.onDispose` registrations could land in a bucket that dispose had already drained.

## Decision

Root and each execution context own a lifecycle phase `open | disposing | disposed` with a single shared `disposePromise`:

- New work (`enter`) is accepted only in `open`.
- `dispose` transitions synchronously to `disposing`, waits until accepted work drains, seals `Lifetime` (further `onDispose` throws), runs cleanups LIFO, and always ends in `disposed` even when a cleanup fails. Concurrent callers await the same promise.
- Composition-lifetime cache, inflight, and disposers are owned by the **root** scope; `.perContext()` state is owned by the **context** scope.
- `root.dispose()` is a backstop: it refuses new contexts, disposes every open execution context, then runs composition-lifetime cleanups.

Rejected: refusing root dispose while contexts remain open (host would have to track them). Rejected: promoting implicit `.perContext()` or `Lifetime.acquire` (out of scope).

## Consequences

- Hosts may rely on `root.dispose()` to close forgotten contexts; they should still stop admitting new work first.
- Design C APIs (`openExecutionContext` / `withExecutionContext` / `AsyncDisposable`) delegate to this same state machine (see ADR 0006).
- Async factory rollback (ADR 0007) builds on drain-then-seal; materialization seals its Lifetime handle after each attempt, and scope sealing makes late cleanup registration fail loudly.
