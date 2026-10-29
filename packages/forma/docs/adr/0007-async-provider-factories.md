# 0007. Async provider factories with local rollback

## Status

Accepted

## Context

Provider factories had to return an operation synchronously. Real resources (connections, channels, sessions) are often acquired asynchronously. Workarounds pushed coalescing, failure retry, partial cleanup, and dispose races into each Provider. Ticket 03 already drains accepted work before sealing scope Lifetime buckets; async setup still needed a local cleanup story so a failed materialization does not leave disposers on the owner until full context/root shutdown.

## Decision

- Factory return type is `Awaitable<IntentOperation<…>>` (sync remains valid).
- Each materialization attempt owns a **local** Lifetime bucket: `onDispose` registers there only while the attempt is open.
- **Success:** seal registration, commit local cleanups onto the effective owner bucket derived by
  the lifetime plan, cache the operation.
- **Failure or abandoned attempt** (including dispose racing an in-flight factory so the owner is no longer `open`): do not cache; run local cleanups immediately (LIFO). Factory error alone propagates; factory + rollback failure → `SuppressedError(rollbackError, factoryError)` (`rollbackError` may be `AggregateError`).
- Concurrent callers of the same provider in the same lifetime share one inflight Promise.
- `AbortSignal` / typed seed on Lifetime: see ADR 0008.

## Consequences

- Async setup is a first-class composition concern; Providers no longer need ad-hoc lazy-init inside the operation for acquire-once resources.
- Stolen `lifetime` handles cannot register cleanups after materialization succeeds, even while the scope is still open.
- Dispose-during-acquire still drains via enter/leave, then rolls back local setup instead of committing orphaned cleanups onto a draining owner bucket.
