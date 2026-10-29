# 05: Design C open/with/AsyncDisposable + surface nesting

**What to build:** `openExecutionContext` (deprecate `createExecutionContext`); `withExecutionContext` with error matrix (`SuppressedError` when both fail); `[Symbol.asyncDispose]` on root and execution handle; execution handle exposes `readonly surface` (aliases leave the top-level handle). Same dispose state machine for all paths. Seed/`AbortSignal` deferred to ticket 07.

**Blocked by:** 03

**Status:** done

- [x] `openExecutionContext` + deprecated `createExecutionContext` alias
- [x] `withExecutionContext` borrowed surface + callback×cleanup error matrix
- [x] `[Symbol.asyncDispose]` on root and execution handle
- [x] Surface nesting; reserve `surface` alias
- [x] Tests: matrix, early return, sync/async, await using, fire-and-forget drain, root-during-with
- [x] Demo + README safe path; ADR 0006; GLOSSARY

**Verify:** `pnpm --filter @xndrjs/forma test` and `typecheck`; `pnpm --filter @xndrjs/forma-demo start`

**Refs:** `packages/forma/docs/architectural-review.md` (Design C), `packages/forma/docs/adr/0006-design-c-execution-api.md`
