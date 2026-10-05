# @xndrjs/resource-graph-resolver

## 0.3.0-alpha.0

### Minor Changes

- 3194a33: Rename `@xndrjs/application-resources` → `@xndrjs/addressable-resources` with a breaking ARI API and wire format. There is **no** re-export shim under the old name; deprecate the published `@xndrjs/application-resources` package on npm manually (`npm deprecate …`) and do not unpublish.

  ### Breaking (`@xndrjs/addressable-resources`)
  - Package rename: install `@xndrjs/addressable-resources` instead of `@xndrjs/application-resources`.
  - ARI identity is a single flat object key (`resource.key`), not a tuple (`resource.key[0]`).
  - `ari(type, objectSchema)` requires exactly one `s.object({...})` (no empty / multi-segment forms).
  - Canonical `toString()` format is `Type(field=value,...)` (lexicographic fields, JSON scalars).
  - Replaced `stableStringifyResource` / `parseStableStringifyResource` with `formatAriString` / `parseAriString`.
  - Renamed types to `AddressableResource*` / `addressableResourceKeySchema`; removed `s.tuple` and `ApplicationResource*` aliases.
  - Add `s.number()` for finite floats (`NaN` / `±Infinity` rejected) and `s.integer()` for finite integers (renames former `s.int()`).

  ### Dependents
  - `@xndrjs/resource-graph-resolver` and `@xndrjs/ziel` depend on and re-export the new package; update imports and `resource.key` access accordingly. Generated Ziel modules import from `@xndrjs/ziel` / `@xndrjs/addressable-resources`.

- 50df7a4: Require Node.js 24 or 25 (`>=24 <26`).

  ### Breaking
  - `ResolveResourceGraphInput.root` is now `roots: readonly AddressableResourceIdentifier[]` (non-empty). Pass a single seed as `roots: [root]`. `ResolutionStartEvent.root` is likewise `roots`.
  - Depends on `@xndrjs/addressable-resources` (renamed from `@xndrjs/application-resources`); use `resource.key` (object), not `resource.key[0]`.
  - `DataSource.load` is positional — return `(payload | undefined)[]` with the same length and order as `batch` (`undefined` = miss; `null` remains a legal payload). Remove `ResourceRedirectRecord` / rematerialize-via-`resolves` from load; identity hops use strategy `.resolve` only.

  ### Redirects and resolve strategy
  - Add strategy-driven post-decode redirects via `createGraphResolutionStrategy().resolve.on(…).when(…).to(…)`. The engine registers redirects then enqueues the target without expanding the locator.
  - Centralize redirect graph semantics with canonical chains, cycle detection, reverse alias propagation, backing-resource parity, and alias-aware failure lookup.
  - Expose `redirects` (locator → canonical ARI) on `ResolveResourceGraphOutput` so projectors can rematerialize settle targets before reading identity keys.

  ### Budgets and docs
  - Bound every graph resolution with configurable node, edge, batch, and duration budgets. Add finite defaults, typed budget errors, observer telemetry, and deadline cancellation.
  - Document first-match datasource and redirect routing (one owner per ARI family). Clarify that loaders must validate untrusted payloads at the boundary.
  - Document operational adoption guidance alongside Ziel (resolver-bench orchestration modes naive / batched).

### Patch Changes

- Updated dependencies [3194a33]
  - @xndrjs/addressable-resources@0.1.0-alpha.0

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
