# 0006. Design C execution API (open / with / AsyncDisposable)

## Status

Accepted

## Context

Execution contexts mixed public surface aliases with lifecycle controls on one flat object (`ctx.getOrder`, `ctx.dispose`). Short scopes forced hosts to write `try/finally` without a documented error matrix. Host-owned lifetimes (modules, WebSockets, framework hooks) need an explicit open/dispose handle, while request-like scopes need a safe default that always cleans up. Several disposal entry points must not invent separate semantics.

## Decision

Adopt **Design C**:

- **Primitive:** `openExecutionContext()` returns an owned handle with `readonly surface`, `dispose()`, and `[Symbol.asyncDispose]`. `createExecutionContext` remains a deprecated alias during migration.
- **Safe default:** `withExecutionContext(run)` opens once, passes a **borrowed** surface (no dispose), awaits the callback, then disposes. Error matrix: callback+cleanup both fail → `SuppressedError(cleanupError, callbackError)`; otherwise the single failure (or the callback value) propagates.
- **Root:** also implements `[Symbol.asyncDispose]` delegating to `dispose()`.
- **One state machine:** every path (`open`/`dispose`, `with`, `await using`, root backstop) uses the existing `open | disposing | disposed` machine (ADR 0004).
- **Nesting:** surface aliases leave the top-level handle; reserved compose keys include `surface` as well as `dispose`.

Deferred to a later ticket: typed seed and `AbortSignal` on the handle; `Lifetime.acquire`.

## Consequences

- Call sites move from `ctx.alias` to `execution.surface.alias` or `withExecutionContext`.
- Demo and README document `withExecutionContext` / `await using` as the safe path; hosts keep `open` when ownership spans mount/unmount.
- Fire-and-forget surface calls still drain via enter/leave before cleanup; escaping a surface method past dispose fails on next use.
