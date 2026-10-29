# 03: Root + context lifecycle state machines — F3/F4

**What to build:** Context states `open | disposing | disposed`; track in-flight work; shared `disposePromise`; reject new work once disposing. Root terminal dispose: sync → disposing → no new contexts → dispose open contexts → composition-lifetime cleanups → `disposed` even on cleanup failure. Document ownership: root is backstop and disposes active contexts.

**Blocked by:** 01 (prefer after 02)

**Status:** done

- [x] Context lifecycle state machine + shared dispose promise
- [x] Root lifecycle state machine + shared dispose promise
- [x] Drain accepted work before sealing Lifetime / running cleanups
- [x] Composition-lifetime owned by root scope (not context disposed flag)
- [x] Root dispose closes open contexts (backstop)
- [x] Late `onDispose` after seal throws
- [x] Tests under review “Lifecycle” (except Surface alias `dispose` → ticket 04)
- [x] ADR 0004 + GLOSSARY / README

**Verify:** `pnpm --filter @xndrjs/forma test` and `typecheck`

**Refs:** `packages/forma/docs/architectural-review.md` (F3, F4), `packages/forma/docs/adr/0004-lifecycle-state-machines.md`
