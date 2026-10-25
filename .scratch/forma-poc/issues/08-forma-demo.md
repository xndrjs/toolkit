# 08: forma-demo

**What to build:** Runnable Node demo app that wires Orders + infra Intents and exercises the PoC surface area.

**Blocked by:** 04: Implicit using graph; 05: Explicit cross-boundary binding; 06: Lifecycle and disposal; 07: Composition safety

**Status:** ready-for-agent

- [ ] `apps/forma-demo` (or equivalent) is a workspace app
- [ ] Script run (e.g. `pnpm --filter … start`) creates composition, opens context, calls surface, disposes ctx and root
- [ ] Uses binding + at least one `.perContext()` provider
- [ ] README one-liner: how to run

**Verify:** command exits 0 and prints a clear success line.

**Refs:** `packages/forma/GLOSSARY.md`, `packages/forma/specs/initial-analysis.md`
