# Superseded: minimal query surface; barrels via filesIn

**Status: superseded by [0014-inventory-listing-at-render](0014-inventory-listing-at-render.md).**

Wave 1 exposed `createInventoryQuery` / `filesIn` / `tsBarrelIndex` alongside flat authoring. Flat authoring was removed with the navigable tree. Inventory listing returns only on the Sync render context (ADR 0014); TS barrel helpers are package utilities, not `A.*` methods.
