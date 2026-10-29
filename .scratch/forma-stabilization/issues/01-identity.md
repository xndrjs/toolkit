# 01: Identity — structured `(boundaryId, intentName)`

**What to build:** Intent identity = structured key (not fresh `Symbol`). Resolver, type-level graph keys, `provide.using` same-boundary, and `adapt` target checks all use that key. Duplicate registration for the same key throws at `compose`. Dot-collision (`a.b`/`c` vs `a`/`b.c`) cannot alias by string concat.

**Blocked by:** none

**Status:** done

- [x] Runtime resolves by structured `(boundaryId, intentName)` (no `Intent.identity` Symbol)
- [x] Type-level compose keys use the same structured pair (not `` `${boundaryId}.${name}` ``)
- [x] Homonymous Boundaries / repeated Intent declarations coalesce
- [x] Competing providers for one key throw at compose
- [x] F1.1–F1.4 covered by tests (`compose.identity.test.ts`, `intent-primitives.test.ts`)
- [x] ADR 0003 + GLOSSARY update

**Verify:** `pnpm --filter @xndrjs/forma test` and `typecheck`

**Refs:** `packages/forma/docs/architectural-review.md` (F1), `packages/forma/docs/adr/0003-structured-intent-identity.md`
