# @xndrjs/resource-graph-resolver-demo

**Not published** — this app is `private` and listed in `.changeset/config.json` `ignore`, so it is excluded from Changesets versioning and from npm publish on both stable and alpha releases.

Workshop for `@xndrjs/resource-graph-resolver` with a Contentful-shaped content model: offline CMA snapshots, `contentful-to-zod` schemas, source-qualified ARIs (`cms.*` / `integration.*`), content-type expansion policies (current resource + payload + execution context), declarative `ResourceSource` backends, and domain-zod aggregation.

Two orchestration entry points: `resolveBarrierDemoPage` and `resolveLaneDemoPage` (optional `signal`). Routes: `/[locale]/barrier` and `/[locale]/lane`. Both call the same `createDemoResolver` and differ only by `strategy`, so the two routes are a controlled comparison of schedulers over identical wiring.

### Walk strategies

| Route               | `strategy`  | Behavior                                                                                                                       |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/[locale]/barrier` | `"barrier"` | Every in-flight batch is awaited before expansion, so wall-clock tracks the **slowest** source in each wave.                   |
| `/[locale]/lane`    | `"lane"`    | Expansion runs as soon as any batch commits, so the fast CMS source keeps batching while an integration request is still open. |

Both produce identical island / `ContentMap` output; only the batch timing differs, which is exactly what the terminal trace makes visible.

### Sources

| Source        | Families                 | Batch size              | Backend it mimics                                         |
| ------------- | ------------------------ | ----------------------- | --------------------------------------------------------- |
| `cms`         | `cms.entry`, `cms.asset` | 100 entries, 100 assets | Contentful Delivery, `sys.id[in]=…` bulk fetch per family |
| `integration` | `integration.product`    | 1 product               | Commercial API accepting one SKU per call                 |

Both sources are serial (default `concurrency: 1`), so the integration source becomes the deliberately slow one: one product per request, one request at a time. That contrast is what makes the difference between the two strategies visible in a single run.

### Simulated network latency

Both sources accept `latencyMs` to delay each mock fetch. Orchestration resolves values as: `ResolveDemoPageOptions` → env → defaults (`0` under Vitest / `quiet`, otherwise CMS `80ms` and integration `350ms` so lane overlap is visible in the terminal).

| Knob                   | Env                           | Effect                                      |
| ---------------------- | ----------------------------- | ------------------------------------------- |
| `cmsLatencyMs`         | `DEMO_CMS_LATENCY_MS`         | Delay per CMS entries/assets fetch          |
| `integrationLatencyMs` | `DEMO_INTEGRATION_LATENCY_MS` | Delay per integration products-by-sku fetch |

Example:

```bash
DEMO_CMS_LATENCY_MS=50 DEMO_INTEGRATION_LATENCY_MS=400 pnpm --filter @xndrjs/resource-graph-resolver-demo dev
```

Traces are produced by a `ResolutionObserver` (`infrastructure/logging/resolve-trace.ts`) rather than by wrapping sources: relative timestamps (`T+…ms`), `▶` / `◀` batch markers, the current in-flight source set, and the island each expansion belongs to — so a shared resource reached from three islands reads as three attributed lines instead of three identical ones.

## Layout

```
app/                          # Next.js UI
  [locale]/barrier/           # barrier walk page
  [locale]/lane/         # lane walk page
src/
  domain/                     # domain-zod shapes
  orchestration/
    resolve-barrier-demo-page.ts    # strategy: "barrier"
    resolve-lane-demo-page.ts       # strategy: "lane"
    resolve-demo-shared.ts          # shared finalize (cache / aggregate)
  infrastructure/
    demo-resolver.ts          # createDemoResolver: sources + policies + strategy
    logging/resolve-trace.ts  # ResolutionObserver → terminal trace
    cms/                      # CMS source: ARIs, CMA snapshots, codegen, demo store, source
      schema-fixtures/
        content-types.json    # normalized Contentful CMA snapshot (committed)
        locales.json          # en-US default, it-IT fallback
      contentful-to-zod.config.ts
      generated/
        contentful.schemas.ts   # Zod schemas from contentful-to-zod (committed)
      fixtures.ts             # in-memory Delivery-like demo store
    integration/              # Integration source: ARIs, catalog, commercial batch source
    content-registry.ts       # DemoContentRegistry = CMS ∪ integration slices
    expansion-policies.ts     # expand by content-type; product → integration.product
    mappers/                  # ContentMap → domain-zod (orchestrator + per-model mappers)
      content-map-to-page-aggregate.mapper.ts
      asset.mapper.ts
      product.mapper.ts
      hero.mapper.ts
      tabs.mapper.ts
      tab.mapper.ts
      menu.mapper.ts
      footer.mapper.ts
```

## Contentful schema codegen

Offline snapshot → Zod (no CMA). After editing `src/infrastructure/cms/schema-fixtures/content-types.json` or `schema-fixtures/locales.json`:

```bash
pnpm --filter @xndrjs/resource-graph-resolver-demo contentful:schema
```

## Run checks

```bash
pnpm --filter @xndrjs/resource-graph-resolver-demo dev
pnpm --filter @xndrjs/resource-graph-resolver-demo typecheck
pnpm --filter @xndrjs/resource-graph-resolver-demo test
```

`dev` runs the Next.js app: aggregated page + island cache in a split view, with the resolution trace for the visited route printed in the dev server terminal.
