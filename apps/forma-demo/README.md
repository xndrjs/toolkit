# @xndrjs/forma-demo

Two small, runnable walkthroughs for `@xndrjs/forma`. Each one has a single job:

- **Orders** shows runtime mechanics: interchangeable Adapters, a real SQLite resource, execution
  params, unary and Stream Intents, lazy materialization, cleanup, and disposal.
- **Editorial** shows architectural evolution: Sitemap and PageBuilder keep local ports while a
  discovered `Routing` Boundary owns path resolution, with two explicit Entry
  Boundaries and infrastructure reachable only through Composition wiring.

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
Sitemap.GenerateSitemapUseCase
└─ Sitemap.EnumerateSitemapEntries ── Adapter ─┬─> ContentCatalog.EnumeratePublishedPages
                                               └─> Routing.ResolvePaths

PageBuilder.CreatePagePreviewUseCase
└─ PageBuilder.ResolvePage ───────────── Adapter ──> Routing.ResolvePaths

ContentCatalog and Routing ───────────── Adapters ──> CmsSnapshot.ReadSnapshot
```

Sitemap begins with the local port it needs to generate a sitemap. Once PageBuilder also needs
editorial path resolution, the shared capability acquires its own internal `Routing` Boundary:

- `GenerateSitemapUseCase` depends only on the Sitemap-owned `EnumerateSitemapEntries` port.
- `SitemapCatalogRouting` realizes that port by obtaining published page metadata from
  `ContentCatalog` and asking `Routing` to resolve those page IDs into canonical paths.
- `PageBuilderRouting` realizes `PageBuilder.ResolvePage` through a one-element call to
  `Routing.ResolvePaths`, interpreting Routing's partial batch result in PageBuilder's distinct
  input, result, and expected-error vocabulary.
- ContentCatalog and Routing are realized through a `CmsSnapshot` Boundary that reads a committed
  JSON artifact from the filesystem. It does not pretend to be Contentful or another remote
  vendor.
- Only `Sitemap` and `PageBuilder` are Entry Boundaries. ContentCatalog, Routing, CmsSnapshot, and
  all Adapters remain in wiring rather than becoming Surface roots.

See [Boundary evolution](./docs/boundary-evolution.md) for the discovery sequence and resulting
graph.

## Layout

```text
src/
├─ orders/
│  ├─ boundaries/       # Orders and real SQLite contracts/Providers
│  ├─ adapters/         # memory and SQLite realizations of Orders seams
│  ├─ composition.ts
│  └─ main.ts
├─ editorial/
│  ├─ boundaries/       # Sitemap, PageBuilder, ContentCatalog, Routing, CmsSnapshot
│  ├─ adapters/         # semantic translations between those Boundaries
│  ├─ fixtures/         # real local CMS export artifact
│  ├─ composition.ts
│  └─ main.ts
└─ shared/              # composition-plan presentation only
```

The examples deliberately do not collect every Forma feature into one graph. Orders explains
runtime ownership; Editorial explains architectural ownership.
