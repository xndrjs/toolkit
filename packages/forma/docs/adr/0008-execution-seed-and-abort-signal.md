# 0008. Execution context seed and AbortSignal

## Status

Accepted

## Context

Execution contexts had no way to carry request-scoped data (tenant, principal, trace ids) into
`.perContext()` factories without globals or threading values through every Intent input.
Factories also lacked a cooperative cancellation signal tied to scope disposal. Design C (ADR 0006)
deferred seed and `AbortSignal`; async factories (ADR 0007) need the signal for acquire-time
cancellation.

## Decision

- `CompositionRoot` and `ExecutionContext` are generic over `Seed` (default `void`).
- `compose({ … })` keeps `Seed = void`. A required seed uses `compose<MySeed>()({ … })`.
- `openExecutionContext` and `withExecutionContext` share `ExecutionContextArgs`: when
  `Seed` is `void`, options are optional (`signal?`); otherwise `{ seed, signal? }` is required.
- Each scope (root and each execution context) owns an `AbortController`. Entering `disposing`
  aborts that controller. An optional host `signal` is linked via `AbortSignal.any` (abort is
  reflected; dispose ownership stays with the host / `with` finally).
- `Lifetime.signal` is the owning scope’s signal. `Lifetime.seed` is set **only** for
  `.perContext()` materializations. Composition-lifetime factories must not read seed (would be a
  captive ambient dependency).
- The execution handle exposes `readonly signal` and `readonly seed` (undefined when `Seed` is
  `void`). Object seeds are stored as a shallow frozen copy.

Out of scope: `Lifetime.acquire`.

## Consequences

- Host-owned lifetimes pass seed on `openExecutionContext({ seed })`; lexical scopes pass the
  same bag as the trailing args to `withExecutionContext(run, { seed })`.
- Closing one context does not abort composition-lifetime factories; only `root.dispose()` does.
- ADR 0006 / 0007 deferred notes are superseded for seed/signal.
