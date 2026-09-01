# @xndrjs/resource-graph-resolver-demo

**Not published** — this app is `private` and listed in `.changeset/config.json` `ignore`, so it is excluded from Changesets versioning and from npm publish on both stable and alpha releases.

Workshop for `@xndrjs/resource-graph-resolver` with a Contentful-shaped content model: offline CMA snapshots, `contentful-to-zod` schemas, source-qualified ARIs (`cms.*` / `integration.*`), content-type expansion policies, declarative `DataSource` backends, island cache, and domain-zod aggregation.

One orchestration entry point: `resolveDemoPage` (route `/[locale]`). It defaults to **`lane`**. To try barrier, flip `DEMO_SCHEDULING_MODE` at the top of `src/orchestration/resolve-demo-page.ts`. Scheduler comparisons live in `@xndrjs/resource-graph-resolver-bench`.

### Integration path

```
app/[locale]/page.tsx
  → resolveDemoPage(locale)
      → loadBackingForRoot (island cache)
      → createDemoResolver({ schedulingMode, sources, expansion })
      → resolver.resolve({ root, backingResources })
      → mapContentMapToPageAggregate
      → persistResolvedIslands
```

### Sources

| Source        | Families                 | Batch size              | Backend it mimics                                         |
| ------------- | ------------------------ | ----------------------- | --------------------------------------------------------- |
| `cms`         | `cms.entry`, `cms.asset` | 100 entries, 100 assets | Contentful Delivery, `sys.id[in]=…` bulk fetch per family |
| `integration` | `integration.product`    | 1 product               | Commercial API accepting one SKU per call                 |

Both sources are serial (default `concurrency: 1`). Uneven latency (fast CMS, slow integration) is what makes lane interesting in the terminal trace.

### Simulated network latency

| Knob                   | Env                           | Effect                                      |
| ---------------------- | ----------------------------- | ------------------------------------------- |
| `cmsLatencyMs`         | `DEMO_CMS_LATENCY_MS`         | Delay per CMS entries/assets fetch          |
| `integrationLatencyMs` | `DEMO_INTEGRATION_LATENCY_MS` | Delay per integration products-by-sku fetch |

Defaults: `0` under Vitest / `quiet`, otherwise CMS `80ms` and integration `350ms`.

```bash
DEMO_CMS_LATENCY_MS=50 DEMO_INTEGRATION_LATENCY_MS=400 pnpm --filter @xndrjs/resource-graph-resolver-demo dev
```

Traces come from a `ResolutionObserver` (`infrastructure/logging/resolve-trace.ts`): relative timestamps, batch markers, in-flight sources, and island attribution.

## Layout

```
app/                          # Next.js UI — /[locale]
src/
  domain/                     # domain-zod shapes (unchanged)
  orchestration/
    resolve-demo-page.ts      # single integration path (scheduling mode flip at top)
  infrastructure/
    demo-resolver.ts          # sources + strategy + scheduling mode
    logging/resolve-trace.ts  # ResolutionObserver → terminal trace
    cms/                      # CMS ARIs, fixtures, codegen, source
    integration/              # product ARIs, catalog, source
    content-registry.ts       # DemoContentRegistry = CMS ∪ integration
    demo-strategy.ts            # graph resolution strategy (expansion + islands)
    cache/                    # island LRU + backing warm + persist
    mappers/                  # ContentMap → domain-zod
```

## Contentful schema codegen

```bash
pnpm --filter @xndrjs/resource-graph-resolver-demo contentful:schema
```

## Run checks

```bash
pnpm --filter @xndrjs/resource-graph-resolver-demo dev
pnpm --filter @xndrjs/resource-graph-resolver-demo typecheck
pnpm --filter @xndrjs/resource-graph-resolver-demo test
```
