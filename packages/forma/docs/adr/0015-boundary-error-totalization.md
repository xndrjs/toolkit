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
  `{ kind: "unexpectedFailure", failure }` with an opaque `FailureId`.
- The four kinds are `success`, `expectedError` (Contract `Err`), `unexpectedFailure` (`UnexpectedFailure`), and
  `cancelled` (`Cancellation`). Unary terminals and stream events share that algebra.
  `success` is repeatable on streams; `expectedError` / `unexpectedFailure` / `cancelled` are terminal.
- `UnexpectedFailure` is a frozen data token (`{ id }`), not an `Error` class. Prefer
  `createUnexpectedFailure()`. No public factory accepts arbitrary ids; Forma keeps no
  `Map<FailureId, unknown>`. Propagating a failure keeps object and id; a new cause creates a new
  id. The raw cause never rides the normal Intent dataflow.
- `InvocationOutcome` envelopes are readonly at the type level but are not frozen at runtime.
  Forma protects its opaque tokens and metadata; application value immutability belongs outside
  the core.
- A Boundary may create a failure explicitly with `unexpectedFailure()`, wrap an existing token, or
  pass an awaitable reporter. The reporter overload always returns a Promise, awaits synchronous or
  asynchronous diagnostics, ignores their resolved value, and isolates throw/rejection so reporting
  cannot replace the original failure. This supports an Observability Boundary without moving the
  raw cause through the graph: the producing Boundary passes censored diagnostic data instead.
  Only automatic core conversions notify optional `compose({ onUnexpectedFailure })` — once, at
  the origin, synchronously, best-effort; that distinct hook cannot alter the outcome.
- Adapters map `success` / `expectedError` and pass `unexpectedFailure` / `cancelled` through unchanged.
  Mapping throws become a new Unexpected Failure (adapter origin). Driver catch belongs on the
  infrastructure Boundary, not the Adapter.
- Expected Errors are `never` or object unions with a finite string-literal `code`. Contract-scoped
  `ctx.out.match` requires a handler for every declared source code, narrows each handler payload,
  and propagates `unexpectedFailure` / `cancelled` unchanged. An undeclared code observed at runtime
  fails the match and is totalized as a new Unexpected Failure at the translating invocation.
- Stream source throw/rejection yields a terminal `unexpectedFailure` event; `next()` does not reject for
  that failure. Early break / dispose / consumer `iterator.throw` keep the lifecycle matrix from
  [0012](./0012-streaming-intents.md).
- `dispose()` and other lifecycle failures remain rejections outside the Intent Contract.

Relationship to abort: `cancelled` completes the protocol so callers and Adapters can propagate
cancellation as data. Host abort vs dispose ownership stays [0008](./0008-execution-seed-and-abort-signal.md);
full normalization of every abort path into `cancelled` is an amendment of that ADR, not a
reopening of totalization.

Extended validation criteria and non-goals live in the analysis document.

## Consequences

- Public helpers `ok` / `err` / `Result` are replaced by `success` / `expectedError` / `unexpectedFailure` /
  `InvocationOutcome` (and peers). Provider `.with` injects Contract-scoped `ctx.out`, including
  matching; a module-level `out` remains for open-generic construction only. Alpha breaking change
  for every operation type and consumer.
- Providers no longer need defensive `try/catch` around Forma dependency operations.
- Composition gains an optional diagnostic hook without a core logger or event bus.
- Remote Adapters (when present) can preserve failure ids without serializing `unknown`; codec
  remains outside Forma core.
