# 06: Lifecycle and disposal

**What to build:** Composition-lifetime vs `.perContext()` materialization; safe concurrent first access; dispose context-owned and composition-owned resources.

**Blocked by:** 03: Surface hello

**Status:** done

- [x] Default provider: same instance across two `createExecutionContext()` calls
- [x] `.perContext()` provider: different instance per context; reused within one context
- [x] Two concurrent first calls in the same lifetime → factory runs once
- [x] `ctx.dispose()` runs context-owned cleanup (test with a disposable stub)
- [x] Composition root `dispose()` runs composition-lifetime cleanup (test + stub); may be thin API

**Verify:** dedicated lifecycle tests (including a concurrent first-access test).

**Refs:** `packages/forma/GLOSSARY.md`, `packages/forma/specs/initial-analysis.md`
