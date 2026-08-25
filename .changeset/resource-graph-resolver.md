---
"@xndrjs/resource-graph-resolver": minor
---

Initial release of the typed content-graph resolver:

- **Barrier** and **lane** engines (`BarrierResolveContentGraphEngine` / `LaneResolveContentGraphEngine`) with the same `execute` contract and shared graph semantics
- Pull-based loading (`DataResolutionPort` / `ResourceLoader` with `accepts` + `process` / `take`), correlated `{ resource, payload }` records
- Payload-scoped expansion policies (`defineExpansionPolicy` / `createExpansionPolicyChain`); deterministic discovery (no sibling observation)
- Islands, dependency maps, serialization, and `buildBackingResourcesFromIslands` with required `onResourceConflict`
- Optional abort signal and resolution limits
