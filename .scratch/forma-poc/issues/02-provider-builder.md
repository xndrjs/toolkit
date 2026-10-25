# 02: Provider builder

**What to build:** On an Intent, build a Provider with `provide` → optional `using` → optional `perContext` → `with(factory)`. `using` only accepts Intents of the **same** boundary brand. No `compose` yet — providers are values you can inspect/test in isolation.

**Blocked by:** 01: Intent primitives

**Status:** ready-for-agent

- [ ] `Ping.provide.with(() => () => …)` builds a provider for a no-deps Intent
- [ ] `Cancel.provide.using({ find: FindOrder }).with(…)` types `find` from FindOrder’s Contract without re-declaring it
- [ ] Type test: `using({ x: OtherBoundaryIntent })` is a compile error
- [ ] `.perContext()` can appear in the chain before `with` (scoping behaviour deferred to 06; here only API + type retention)
- [ ] Unit/type tests pass; package builds

**Verify:** a small test file constructs providers; `tsc`/type tests catch cross-boundary `using`.

**Refs:** `packages/forma/GLOSSARY.md`, `packages/forma/specs/initial-analysis.md`
