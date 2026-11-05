# @xndrjs/forma-demo

Two small, runnable walkthroughs for `@xndrjs/forma`. Each one has a single job:

- **Orders** shows runtime mechanics: interchangeable Adapters, a real SQLite resource, execution
  params, unary and Stream Intents, lazy materialization, cleanup, and disposal.
- **Editorial** shows architectural evolution: a capability extracted into `Routing`, a temporary
  Intent alias for an unchanged consumer, an Adapter for a consumer with different semantics, and
  two explicit Entry Boundaries.

Neither walkthrough is a test suite. Behavioural guarantees live in `packages/forma/test`.

## Run

```bash
pnpm --filter @xndrjs/forma-demo start:orders:sqlite
pnpm --filter @xndrjs/forma-demo start:orders:memory
pnpm --filter @xndrjs/forma-demo start:editorial
```

All commands print `root.describePlan()` before invoking the Surface.

## Orders: same Boundary, two real implementations

```text
Orders Surface
├─ GetOrderDetailsUseCase ── FindOrderById ──────────────┐
└─ WatchOrderEventsUseCase ─ FindOrderEventsByOrderId ───┤
                                                         ├─ OrdersMemory Adapter
                                                         └─ OrdersSqlite Adapter ──> SQLite Boundary
```

The SQLite composition uses Node's real `node:sqlite` engine with an in-memory database. It creates
schema and fixture rows, runs SQL queries, streams rows from `order_events`, and closes the actual
database with the composition lifetime. The memory composition uses a `Map` and identifies itself
honestly as an in-memory implementation.

Both compositions expose the same Orders Surface. Guests are rejected by Orders policy before the
storage seam is invoked. `WatchOrderEventsUseCase` is a cold, single-consumer stream; natural
completion, `break`, and execution-context disposal close the generator.

## Editorial: moving capability ownership

```text
Sitemap.GetSitemapEntryUseCase
└─ Sitemap.ResolveSitemapPath ── alias ────────┐
                                               v
PageBuilder.CreatePagePreviewUseCase      Routing.ResolvePath
└─ PageBuilder.ResolvePage ── Adapter ─────────┤
                                               v
                                  RoutingCmsSnapshot Adapter
                                               v
                             CmsSnapshot.FindSnapshotEntryByPath
```

`ResolvePath` originally belonged to Sitemap. Once PageBuilder also needed route resolution, the
shared capability moved to the internal `Routing` Boundary:

- `Sitemap.ResolveSitemapPath` and `Routing.ResolvePath` are exact synonyms during migration, so an
  `aliasIntent` keeps the existing Sitemap Provider unchanged.
- PageBuilder owns a different input, result, and expected-error vocabulary, so an Adapter realizes
  `PageBuilder.ResolvePage` through `Routing.ResolvePath`.
- Routing is realized through a `CmsSnapshot` Boundary that reads a committed JSON artifact from
  the filesystem. It does not pretend to be Contentful or another remote vendor.
- Only `Sitemap` and `PageBuilder` are Entry Boundaries. Routing, CmsSnapshot, Adapters, and the
  migration alias remain private wiring.

See [Boundary evolution](./docs/boundary-evolution.md) for the migration sequence and the intended
final cleanup.

## Layout

```text
src/
├─ orders/
│  ├─ boundaries/       # Orders and real SQLite contracts/Providers
│  ├─ adapters/         # memory and SQLite realizations of Orders seams
│  ├─ composition.ts
│  └─ main.ts
├─ editorial/
│  ├─ boundaries/       # Sitemap, PageBuilder, Routing, CmsSnapshot
│  ├─ adapters/         # semantic translations between those Boundaries
│  ├─ fixtures/         # real local CMS export artifact
│  ├─ composition.ts
│  └─ main.ts
└─ shared/              # composition-plan presentation only
```

The examples deliberately do not collect every Forma feature into one graph. Orders explains
runtime ownership; Editorial explains architectural ownership.
