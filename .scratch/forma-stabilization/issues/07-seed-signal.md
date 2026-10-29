# 07: Seed + AbortSignal on execution context

**What to build:** Typed optional seed on `open`/`with`; `signal` on execution context and Lifetime; abort on dispose; document host vs lexical ownership with seed.

**Blocked by:** 05, 06

**Status:** done

- [x] `CompositionRoot` / `ExecutionContext` generic over `Seed` (default `void`)
- [x] `compose<Seed>()({ … })` for required seed; `compose({ … })` stays void
- [x] Shared `ExecutionContextArgs` / `ExecutionContextOptions` on open + with
- [x] Scope `AbortController`; dispose aborts; optional host `signal` via `AbortSignal.any`
- [x] `Lifetime.signal`; `Lifetime.seed` only for `.perContext()`
- [x] Handle exposes `signal` + `seed`; shallow-frozen object seeds
- [x] Tests: per-context seed, dispose aborts, root vs context signal, args typing, host signal
- [x] ADR 0008 + GLOSSARY / README; update ADR 0006/0007 deferred notes

**Verify:** `pnpm --filter @xndrjs/forma test` and `typecheck`

**Refs:** `packages/forma/docs/architectural-review.md` (Design C seed/signal), `packages/forma/docs/adr/0008-execution-seed-and-abort-signal.md`
