# 0008. Execution context params and AbortSignal

## Status

Accepted (amended: `seed` renamed to `params`; declaration on `.perContext`; plain outer bag,
shallow readonly; removed from Lifetime)

## Context

Execution contexts had no way to carry request-scoped data (tenant, principal, trace ids) into
`.perContext()` factories without globals or threading values through every Intent input.
Factories also lacked a cooperative cancellation signal tied to scope disposal. Design C (ADR 0006)
deferred this; async factories (ADR 0007) need the signal for acquire-time cancellation.

The first cut named the bag `seed` and hung it on `Lifetime`, which conflated ownership hooks with
host invocation data and forced `as` casts in factories (`Lifetime.seed` was `unknown`).

## Decision

- Name the host open/with invocation bag **`params`** (not `context` — that word is reserved for
  Execution context; not `seed`).
- `params` lives on factory `WithContext` and on the execution handle — **not** on
  `Lifetime` (`Lifetime` keeps `signal` + `onDispose` only).
- Declaration: `.perContext<ParamsReq>()` (default `void` = no params). `ParamsReq` is a plain
  outer object bag; `auto` Providers narrowed to context do not gain params capability;
  `.perComposition()` Providers cannot declare params.
- Runtime accepts only an outer bag whose prototype is `Object.prototype` or `null`, with own,
  enumerable, string-keyed data properties. Arrays, functions, class instances, built-ins,
  accessors, symbols, non-enumerable properties, and `__proto__` are rejected before the context
  opens.
- Forma clones the validated bag and shallow-freezes that copy. Nested values are intentionally
  neither validated nor frozen. The execution handle and every `.perContext()` materialization in
  that context receive the same normalized copy.
- TypeScript performs a best-effort mirror that rejects primitives, functions, arrays, and
  non-string keys, including on `compose<Explicit>()`; prototype validation remains authoritative
  at runtime.
- `compose({ … })` **infers** required params by merging all registered Providers' ParamsReq;
  incompatible same-key types fail at compose. open/with require `{ params }` when the merge is
  non-void. `compose<Explicit>()({ … })` is only for an explicit **superset** of the inferred bag.
- Each scope (root and each execution context) owns an `AbortController`. Entering `disposing`
  aborts that controller. An optional host `signal` is linked via `AbortSignal.any` (abort is
  reflected; dispose ownership stays with the host / `with` finally).
- Opening an execution context with an already-aborted host signal fails immediately with that
  signal's reason.
- A later host abort closes acceptance without auto-disposing the context: new unary invocations
  reject with `signal.reason`, new cold streams do not start, and already-accepted work observes
  the signal cooperatively. The host must still dispose a context opened with
  `openExecutionContext()`.

Out of scope: `Lifetime.acquire`; params namespaced by Boundary/Intent; runtime pick of declared keys.

## Consequences

- Hosts pass `{ params }` on `openExecutionContext` / `withExecutionContext`; factories read
  typed `params` with no cast.
- Params means **plain outer bag, shallow readonly**, not a recursively immutable object graph.
- Closing one context does not abort composition-lifetime factories; only `root.dispose()` does.
- Host cancellation and resource ownership remain separate: abort can stop work, but only dispose
  releases context-owned Provider resources.
- Alpha: no deprecated `seed` alias.
