---
"@xndrjs/resource-graph-resolver": minor
---

Add `createGraphResolutionStrategy()` fluent DSL for authoring expansion and island policies. `createResourceGraphResolver` now takes a single `strategy: GraphResolutionStrategy` instead of separate `expansion` and `islands` ports. Low-level policy chain helpers are no longer part of the public API.
