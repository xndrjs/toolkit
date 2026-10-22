# 02 — tsBarrelIndex utility

**Status:** ready-for-agent

**Blocked by:** 01

## Delivers

- Module `packages/struttura/src/ts/`: `tsBarrelIndex`, `renderTsBarrel`, `relativeTsModule`
- `tsBarrelIndex(opts)` returns a `FileContentFn` that uses `filesIn(ctx.directory)` then emits export-star lines
- Export from `packages/struttura/src/index.ts`
- Unit tests
- Not on `ArchitectureBuilder` / no `A.barrelIndex`

## Done when

Callers can pass `tsBarrelIndex({ recursive: true })` (or equivalent opts) as Sync file content; package exports and tests cover rendering from `filesIn` results.

## Refs

- `../spec.md`
- `packages/struttura/docs/adr/0014-inventory-listing-at-render.md`
- Ticket 01 (`filesIn` + `ctx.directory`)
