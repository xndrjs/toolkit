# 03 — Demo Sync barrels

**Status:** ready-for-agent

**Blocked by:** 02

## Delivers

- In `apps/struttura-demo/architecture/architecture.ts`, replace emptyBarrel layer indexes with Sync `tsBarrelIndex({ recursive: true })`
- Leave package-level static Sync indexes unchanged
- Codegen + apply so barrels list kit files; no accidental scaffold overwrites
- Update demo README

## Done when

Demo layer `index.ts` barrels regenerate from Desired inventory via Sync; package-level static indexes remain; codegen/apply/test/typecheck pass for the demo.

## Refs

- `../spec.md`
- `packages/struttura/docs/adr/0014-inventory-listing-at-render.md`
- Ticket 02 (`tsBarrelIndex`)
- `apps/struttura-demo/architecture/architecture.ts`
