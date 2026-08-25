# @xndrjs/resource-graph-resolver

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
