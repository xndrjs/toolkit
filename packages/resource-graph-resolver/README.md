# @xndrjs/resource-graph-resolver

Infrastructure-layer **resource graph** resolution: typed `ContentMap`, island membership, expansion policies, declarative multi-backend sources, and portable island serialization.

Full guide: [Resource graph resolver](https://www.xndrjs.dev/v0/infrastructure/resource-graph-resolver/) on the xndrjs docs site.

## Installation

```bash
npm install @xndrjs/resource-graph-resolver @xndrjs/addressable-resources
```

## Quick start

Declare one source per transport channel. A source lists the ARI types it handles, declares the channel's batch limit and how many requests it tolerates in parallel, then fetches one heterogeneous batch the resolver hands it:

```ts
import { defineDataSourceFor } from "@xndrjs/resource-graph-resolver";

const defineSource = defineDataSourceFor<AppContentRegistry, ExecutionContext>();

const cmsSource = defineSource({
  id: "cms",
  for: [cmsEntryAri, cmsAssetAri],
  batchSize: 100,
  async load(batch, { signal }) {
    return contentfulDelivery.fetchBatch(batch, { signal });
  },
});

const productSource = defineSource({
  id: "products",
  for: [productAri],
  batchSize: 1,
  concurrency: 4,
  load: (batch, { signal }) => fetchProducts(batch, signal),
});
```

Then wire one resolver and reuse it per request:

```ts
import {
  createResourceGraphResolver,
  createGraphResolutionStrategy,
} from "@xndrjs/resource-graph-resolver";

const strategy = createGraphResolutionStrategy().expansion(/* ... */).islands(/* ... */).build();

const resolver = createResourceGraphResolver({
  sources: [cmsSource, productSource],
  strategy,
  schedulingMode: "lane",
  budget: { maxNodes: 2_000, maxDurationMs: 5_000 },
});

const output = await resolver.resolve({
  roots: [pageAri({ id: "home", locale: "en-US" })],
  executionContext: { locale: "en-US" },
});
```

## Scheduling modes

| Scheduling mode | Scheduler                                                          | When to prefer                                                              |
| --------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `lane`          | Expand as soon as any batch commits; sources advance independently | Uneven backend latency; a fast CMS should not wait on a slow commercial API |
| `barrier`       | Wait for every in-flight batch, then expand together               | Reproducible rounds for tracing and tests; backends of similar latency      |

Under `lane`, a fast source keeps walking its own subgraph while a slow peer's request is still open, so wall clock stops tracking the slowest backend in every wave.

## Routing (first-match)

Datasource and redirect routing are both **first-match in declaration order**:

- **`sources`** — for each ARI, the resolver walks `sources` and picks the first whose optional `when` passes and whose `for` list contains a matching family. Later overlapping sources are never consulted.
- **Strategy `.resolve` policies** — the first matching resolve policy wins; `undefined` means no redirect.

Overlapping owners are not detected or validated. Declare **one owner per ARI family** (and keep resolve-policy order intentional). Payloads returned by `load` are trusted by the engine — validate untrusted transport data inside the loader before returning.

## Runtime budgets

Every resolution has finite defaults: 10,000 distinct nodes, 50,000 distinct expansion/redirect edges, 1,000 datasource batches, and 30 seconds. Override only the limits appropriate for your topology through `ResourceGraphResolverConfig.budget`; omitted fields keep their defaults.

Crossing a limit aborts the resolution with `ResourceGraphBudgetExceededError` and emits `onBudgetExceeded`. Datasource calls receive a signal that aborts on either the caller's cancellation or the internal deadline. Loaders should forward it to their transport; a loader that ignores cancellation may continue its own work, but the resolver stops waiting for it at the deadline.

## Concepts

- **`ContentRegistry`** — maps ARI `type` literals to payload shapes; `ContentMap.get` follows `resource.type`. Compose per-source slices with `ComposeContentRegistry`.
- **`DataSource`** — one transport channel: the ARI types in `for`, its batch limit, its concurrency budget, and positional `load(batch)` → `(payload | undefined)[]` (same length/order; `undefined` = miss).
- **`createGraphResolutionStrategy()`** — fluent builder for expansion, island, and resolve policies; `.build()` returns a `GraphResolutionStrategy` for the resolver. Use `.resolve.on(ari).when(…).to(…)` for post-decode redirects (identity hops belong here, not in `load`).
- **`IslandDependencyMap`** — direct edges between islands; `getFlatDependencies` builds transitive cache manifests (cycles excluded from the start island).
- **`backingResources`** — pre-resolved payloads consulted before any source is asked. The map is never mutated; keys the walk actually reached come back as `promotedResourceKeys`.
- **`ResolutionObserver`** — optional hooks for batches, expansions, promotions, misses and budget exhaustion. Observer failures never affect resolution.
- **Errors** — `ResourceGraphError` base, plus `MissingResourceError`, `NoDataSourceError` (no source declares a matching family — a wiring bug, not missing data), `ResourceLoadFailedError` (wraps a rejected `load`), `ResourceBatchLengthError` (wrong result length), `ResourceGraphAbortedError`, `ResourceGraphBudgetExceededError`, and `ResourceRedirectCycleError`. `ResolutionError` is a class: datasources can `throw new ResolutionError(code, message, cause)`; the resolver preserves it (`instanceof`), attributes `resourceKey` / island ids, and collects instances into `output.errors` under soft `onFailure` (`setNull` and `setError`). `toResolutionErrorData` converts it to the JSON-safe `ResolutionErrorData` value used by generated `set error` projections.
- **`onFailure`** — per expansion edge (`ExpansionResult.onFailure`: `"throw"` | `"setNull"` | `"setError"`, default `"throw"`). Roots always throw. Same ARI from multiple edges → strictest wins (`throw` > `setError` > `setNull`). Soft policies always populate `output.errors` (global signal) while generated projection stays local (`null` / `ResolutionErrorData`). There is no global `missingResourceMode` on `ResolveResourceGraphInput` — soft failures are declared on the discovering edge (Ziel: `on failure set null` / `set error`).
- **`serializeAllIslands`** — cache-ready payloads (`SerializedIsland`, schema v1).

## Redirect invariants

Strategy `.resolve` policies run after a locator payload has been decoded and before that resource expands. Policy order is first-match (see [Routing](#routing-first-match)). Redirect chains are canonicalized: if `A → B → C`, resolution loads and expands `C`, `output.redirects` contains both `A → C` and `B → C`, and the canonical payload is available from `contentMap` through all three ARIs.

Redirects obey the same invariants for normal loads and `backingResources`. Several locators converging on one target still load that target once. Self-cycles and longer redirect cycles always throw `ResourceRedirectCycleError`; they are structural strategy errors and are not softened by per-edge failure policies.

Soft target failures appear once in `output.errors`, attributed to the canonical target. `output.failures` is the projection-oriented lookup: it contains the canonical key and every redirect alias, all pointing to the same `ResolutionError` instance. Failed aliases do not retain their temporary decode payloads in `contentMap`.

## Demo

See [`apps/resource-graph-resolver-demo`](https://github.com/xndrjs/toolkit/tree/main/apps/resource-graph-resolver-demo) for Contentful-shaped fixtures, tiered island cache, and domain-zod aggregation.

## License

MIT
