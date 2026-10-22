# Inventory listing only at Sync render; TS barrel as package utility

Sync content may list managed file Artifacts under a DirRef from the Desired inventory (`filesIn` on the render context): DirRef identity match, optional recursive path subtree, `includeSelf` default false, `exclude` as relative path strings/RegExp. Listing is not available in `A.construct` builders and is not restored as a global authoring query.

Language-specific barrel helpers (e.g. `tsBarrelIndex` / `renderTsBarrel`) are exported utilities from `@xndrjs/struttura`, not methods on `A`. They compose `filesIn` + string rendering into a Sync `A.file` content function. Instance enumeration for root tsconfig remains a later step.
