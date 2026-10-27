# 003 — `createPlopOs` runtime + registration API

## Goal

Single consumer-facing object wired from a plopfile: Discovery config, rule registration, Sync generator registration, and Sync execution.

## Depends on

- 001, 002

## Scope

- `createPlopOs({ roots?, ignore? })` returning API roughly:
  - `addDiscoveryRule(rule)`
  - `syncGenerator(id, fn)`
  - `candidates(ruleName, baseDir?)`
  - `resolveCandidate` / `resolveSubdir`
  - `sync({ id?, baseDir? })`
- Plopfile is the only required config entrypoint (no parallel `struttura.config.ts`).
- Export public surface from `src/index.ts`.
- `plopAddFlags(conflictPolicy)` helper mapping `skip | overwrite | throw` → Plop `skipIfExists` / `force` (default policy conceptually `throw`).

## Out of scope

- CLI (005), full non-interactive runner (004) — only the helpers/types they will need.
- Built-in domain generators (core/model); those stay in consumer/demo.

## Acceptance

- [ ] Unit/smoke tests: register rule + list candidates; register sync generator + sync pass.
- [ ] README stub can show a 10-line plopfile sketch (full docs in 007).
- [ ] Package builds and typechecks with real exports (no longer empty `export {}` only).

## References

- Grilling decisions Q3, Q7, Q13
