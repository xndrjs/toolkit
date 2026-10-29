# 0008. Execution context params and AbortSignal

## Status

Accepted (amended: `seed` renamed to `params`; declaration on `.perContext`; removed from Lifetime)

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
- Declaration: `.perContext<ParamsReq>()` (default `void` = no params). `ParamsReq` is an object
  POJO (nested fields ok); not a bare primitive bag. `auto` Providers narrowed to context do not
  gain params capability; `.perComposition()` Providers cannot declare params.
- Factory types expose the declared `ParamsReq` as `params`. Runtime passes the **same frozen host
  bag** to every `.perContext` materialization.
- `compose({ … })` **infers** required params by merging all registered Providers' ParamsReq;
  incompatible same-key types fail at compose. open/with require `{ params }` when the merge is
  non-void. `compose<Explicit>()({ … })` is only for an explicit **superset** of the inferred bag.
- Each scope (root and each execution context) owns an `AbortController`. Entering `disposing`
  aborts that controller. An optional host `signal` is linked via `AbortSignal.any` (abort is
  reflected; dispose ownership stays with the host / `with` finally).

Out of scope: `Lifetime.acquire`; params namespaced by Boundary/Intent; runtime pick of declared keys.

## Consequences

- Hosts pass `{ params }` on `openExecutionContext` / `withExecutionContext`; factories read
  typed `params` with no cast.
- Closing one context does not abort composition-lifetime factories; only `root.dispose()` does.
- Alpha: no deprecated `seed` alias.
