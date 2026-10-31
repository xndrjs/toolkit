# 0015. Boundary error totalization

## Status

Accepted

## Context

Intent Contracts declared `Success` and `Err`, but operations could still end via throw or
Promise rejection. Callers therefore faced two protocols — a typed result and an untyped
exceptional channel — and had to add defensive `try/catch` around every Boundary crossing.
[boundary-error-totalization.md](../boundary-error-totalization.md) grilled the target model;
this ADR records the normative decision.

## Decision

- Every Intent operation obtained from a Boundary (Surface alias or `using` dependency) exits as
  `InvocationOutcome<Success, Err>` (or `Promise` / stream of the same algebra). Implementation
  throw/rejection does **not** cross the Boundary: Forma converts it at the origin into
  `{ kind: "unexpected", failure }` with an opaque `FailureId`.
- The four kinds are `success`, `error` (Contract `Err`), `unexpected` (`UnexpectedFailure`), and
  `cancelled` (`Cancellation`). Unary terminals and stream events share that algebra.
  `success` is repeatable on streams; `error` / `unexpected` / `cancelled` are terminal.
- `UnexpectedFailure` is a frozen data token (`{ id }`), not an `Error` class. Prefer
  `createUnexpectedFailure()`. No public factory accepts arbitrary ids; Forma keeps no
  `Map<FailureId, unknown>`. Propagating a failure keeps object and id; a new cause creates a new
  id. The raw cause never rides the normal Intent dataflow.
- A Boundary may create a failure explicitly, log the same id, and return `unexpected(failure)`.
  Only automatic core conversions notify optional `compose({ onUnexpectedFailure })` — once, at
  the origin, synchronously, best-effort; the hook cannot alter the outcome.
- Adapters map `success` / `error` and pass `unexpected` / `cancelled` through unchanged.
  Mapping throws become a new unexpected (adapter origin). Driver catch belongs on the
  infrastructure Boundary, not the Adapter.
- Stream source throw/rejection yields a terminal `unexpected` event; `next()` does not reject for
  that failure. Early break / dispose / consumer `iterator.throw` keep the lifecycle matrix from
  [0012](./0012-streaming-intents.md).
- `dispose()` and other lifecycle failures remain rejections outside the Intent Contract.

Relationship to abort: `cancelled` completes the protocol so callers and Adapters can propagate
cancellation as data. Host abort vs dispose ownership stays [0008](./0008-execution-seed-and-abort-signal.md);
full normalization of every abort path into `cancelled` is an amendment of that ADR, not a
reopening of totalization.

Extended validation criteria and non-goals live in the analysis document.

## Consequences

- Public helpers `ok` / `err` / `Result` are replaced by `success` / `expectedError` /
  `InvocationOutcome` (and peers). Alpha breaking change for every operation type and consumer.
- Providers no longer need defensive `try/catch` around Forma dependency operations.
- Composition gains an optional diagnostic hook without a core logger or event bus.
- Remote Adapters (when present) can preserve failure ids without serializing `unknown`; codec
  remains outside Forma core.
