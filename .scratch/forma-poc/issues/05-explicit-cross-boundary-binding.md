# 05: Explicit cross-boundary binding

**What to build:** Business Intent requires a local Intent; composition satisfies it with `bindings: [[Required, Satisfier]]` where Satisfier is an infrastructure Intent with a structurally matching Contract (duplicated types per boundary). Plus one path where shapes differ: an **adapter provider** (ordinary provider / helper that returns a provider) is what gets bound — not a `compose` keyword.

**Scenario:** Orders `FindOrder` ←bound— Postgres `SelectOrder`; surface calls through `GetOrder` (or a surface that needs `FindOrder`).

**Blocked by:** 03: Surface hello

**Status:** ready-for-agent

- [ ] Binding rewrite: requirement for `FindOrder` uses `SelectOrderProvider`
- [ ] Structural match accepted without adapter
- [ ] Mismatch path: adapter provider + binding makes the call succeed; documented in test
- [ ] Business provider code does not import the infra Intent type into `using` (only local Intent)

**Verify:** tests for match + adapter; package builds.

**Refs:** `packages/forma/GLOSSARY.md`, `packages/forma/specs/initial-analysis.md`
