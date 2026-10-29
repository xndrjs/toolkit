# 06: Async factories + rollback

**What to build:** Factory may return `Awaitable<operation>`; local lifetime during setup; seal after success; rollback partial cleanups on failure; failed materialization not cached; coalesced inflight; dispose-during-acquire semantics explicit.

**Blocked by:** 03

**Status:** done

- [x] `Awaitable` factory return type on Provider / `.with`
- [x] Local materialization Lifetime bucket (commit / rollback)
- [x] Seal registration after attempt; failed attempts not cached; retry ok
- [x] `SuppressedError(rollback, factory)` when both fail
- [x] Dispose-during-acquire rolls back local cleanups
- [x] Tests under review “Factory async”
- [x] ADR 0007 + GLOSSARY / README

**Verify:** `pnpm --filter @xndrjs/forma test` and `typecheck`

**Refs:** `packages/forma/docs/architectural-review.md` (Factory async), `packages/forma/docs/adr/0007-async-provider-factories.md`
