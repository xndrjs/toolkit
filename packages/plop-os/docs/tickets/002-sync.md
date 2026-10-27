# 002 — Sync: markers, fail-closed pass, ctx

## Goal

Replace only the interiors of explicit Regions using registered Sync generators, fail-closed before any write on structural or generator errors.

## Depends on

- 001 (Discovery available on `ctx`)

## Scope

- Marker syntax: `//` or `#` + `plop-os-sync start|end <syncId>` (line-oriented).
- Regions: balanced, non-nested; diagnostics with file:line.
- Sync ID → registered `SyncGenerator`; same ID may appear in many files / multiple regions.
- `SyncContext`: at least `filePath`, `syncId`, Discovery API scoped to configured roots.
- `runSyncPass({ id?, baseDir? })`: scan perimeter; validate all selected regions + generators; compute all bodies; then write. Throw/non-string from a generator aborts the whole pass with **no** writes.
- Overwrite Region body only; preserve markers and surrounding handwritten code.

## Out of scope

- Nested regions, dry-run CLI, Plop custom action type (Sync is a plop-os API).

## Acceptance

- [ ] Unit tests: parse happy path; nested/unclosed/end-without-start throw before write; missing generator throws; generator throw leaves files unchanged; multi-region same file bottom-up replace; baseDir escape throws.
- [ ] Handwritten file with markers participates without scaffold identity.
- [ ] Clean rewrite (do not copy `spike/src/sync.ts` blindly).

## References

- `GLOSSARY.md` — Region, Sync ID, Sync generator, Sync context
- `spike/notes.md`, `spike/src/sync.ts`
