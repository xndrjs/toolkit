# Superseded: minimal query surface; barrels via filesIn

**Status: superseded** by the navigable tree authoring contract (pre-0.1.0).

Wave 1 exposed `createInventoryQuery` / `filesIn` / `tsBarrelIndex` for sync barrels and root tsconfig generation. That public query surface and the flat `defineConstruct` / `dir` / `file` / `root` authoring API were removed: barrels and workspace root tsconfig in the demo are scaffold (hand-maintained), and constructs are authored only via `A.construct` + `A.in`.

The reconcile/scaffold/sync engine is unchanged; post-population query helpers may return in a later step without restoring the flat authoring API.
