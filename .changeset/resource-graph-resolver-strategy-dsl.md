---
"@xndrjs/resource-graph-resolver": minor
---

### Scheduling

- Rename `ResolutionStrategy` to `SchedulingMode`. Resolver config field is now `schedulingMode` (was `strategy`).
- `ResolutionStartEvent` reports `schedulingMode`.

### Islands

- Island boundaries are separate from expansion via `GraphResolutionStrategy.islands` (removed `isIsland` from `ExpansionResult`).

### Expansion

- Matching expansion policies are merged: children are concatenated in policy order and deduplicated by `resource.toString()`.

### Strategy DSL

- Add `createGraphResolutionStrategy()` fluent builder with `.expansion` and `.islands` namespaces.
- `createResourceGraphResolver` takes `strategy: GraphResolutionStrategy` instead of separate `expansion` and `islands` ports.
- Low-level `createExpansionPolicyChain`, `defineExpansionPolicy`, `createIslandPolicyChain`, and `defineIslandPolicy` are no longer part of the public API.
