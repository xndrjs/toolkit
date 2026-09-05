# @xndrjs/resource-graph-resolver

## 0.2.0-alpha.0

### Minor Changes

- cdbf303: ### Scheduling
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

  ### DataSource
  - Redesign around transport channels: `for` replaces per-family `families`, `batchSize` is a single channel limit, and `load(batch)` receives a flat heterogeneous batch instead of a per-family record.
  - Resolver routing uses first-match source order; overlapping sources are not validated.
  - `DataSource.batchSize` is optional, matching `DataSourceDefinition`. Hand-written `DataSource` objects (bypassing `defineDataSourceFor`) no longer need to spell out `batchSize: undefined`.

## 0.1.0

### Minor Changes

- 39ac230: Initial release of the typed resource graph resolver:
  - **`createResourceGraphResolver`** — one resolver, one `resolve` contract, `strategy: "lane" | "barrier"` selecting only how expansion is scheduled against in-flight loads. Both strategies produce identical graph output.
  - **`DataSource`** / **`defineDataSourceFor`** — a backend declares the ARI families it owns, its per-family `batchSize` and its `concurrency`, then receives a narrowed, grouped batch in `load`. The resolver owns routing, chunking, throttling and scheduling; the source owns transport and its own retry policy.
  - Payload-scoped expansion policies (`defineExpansionPolicy` / `createExpansionPolicyChain`). Expansion sees only the current resource, its payload and the execution context, so discovery cannot depend on siblings, batch composition, or the island a resource was reached from.
  - Islands, dependency maps, serialization, and `buildBackingResourcesFromIslands` with required `onResourceConflict`. A resource reachable from several islands is tracked in all of them while being fetched once.
  - **`ResolutionObserver`** — optional hooks for batches, expansions, promotions and misses; observer failures never affect resolution.
  - Typed errors: `ResourceGraphError`, `MissingResourceError`, `NoDataSourceError`, `ResourceLoadFailedError`, `ResourceGraphAbortedError`.
  - Cooperative cancellation via `signal`, forwarded to sources; `backingResources` is read-only and reports what the walk actually promoted.

### Patch Changes

- 592d077: Rename `ResourceSource` → `DataSource` (`defineDataSourceFor`, `DataSourceDefinition`, `NoDataSourceError`) and align package docs with infrastructure-layer ARI placement.
- Updated dependencies [d7da4f6]
  - @xndrjs/application-resources@0.2.0

## 0.1.0-alpha.1

### Patch Changes

- 592d077: Rename `ResourceSource` → `DataSource` (`defineDataSourceFor`, `DataSourceDefinition`, `NoDataSourceError`) and align package docs with infrastructure-layer ARI placement.

## 0.1.0-alpha.0

### Minor Changes

- 39ac230: Initial release of the typed resource graph resolver:
  - **`createResourceGraphResolver`** — one resolver, one `resolve` contract, `strategy: "lane" | "barrier"` selecting only how expansion is scheduled against in-flight loads. Both strategies produce identical graph output.
  - **`ResourceSource`** / **`defineResourceSourceFor`** — a backend declares the ARI families it owns, its per-family `batchSize` and its `concurrency`, then receives a narrowed, grouped batch in `load`. The resolver owns routing, chunking, throttling and scheduling; the source owns transport and its own retry policy.
  - Payload-scoped expansion policies (`defineExpansionPolicy` / `createExpansionPolicyChain`). Expansion sees only the current resource, its payload and the execution context, so discovery cannot depend on siblings, batch composition, or the island a resource was reached from.
  - Islands, dependency maps, serialization, and `buildBackingResourcesFromIslands` with required `onResourceConflict`. A resource reachable from several islands is tracked in all of them while being fetched once.
  - **`ResolutionObserver`** — optional hooks for batches, expansions, promotions and misses; observer failures never affect resolution.
  - Typed errors: `ResourceGraphError`, `MissingResourceError`, `NoResourceSourceError`, `ResourceLoadFailedError`, `ResourceGraphAbortedError`.
  - Cooperative cancellation via `signal`, forwarded to sources; `backingResources` is read-only and reports what the walk actually promoted.

### Patch Changes

- Updated dependencies [d7da4f6]
  - @xndrjs/application-resources@0.2.0-alpha.0
