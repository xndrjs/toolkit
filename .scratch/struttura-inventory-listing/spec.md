# Inventory listing + Sync barrels

Contract for tickets 01–03. Closed decisions live in ADR 0014 and the glossary; this file only points agents at those sources and the ticket sequence.

## Refs

- `packages/struttura/docs/adr/0014-inventory-listing-at-render.md`
- `packages/struttura/GLOSSARY.md` (DirRef, Desired inventory, inventory listing)
- Superseded context: `packages/struttura/docs/adr/0004-minimal-query-surface.md`

## Sequence

1. `issues/01-filesin-render.md` — `filesIn` + `ctx.directory` on Sync render
2. `issues/02-ts-barrel-utility.md` — `tsBarrelIndex` package utility
3. `issues/03-demo-sync-barrels.md` — demo layer barrels via Sync

## Out of scope

- `instances()` / WorkspaceRoot tsconfig Sync
- Restoring a global authoring inventory query or `A.barrelIndex`
