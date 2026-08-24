# @xndrjs/resource-graph-resolver-demo

**Not published** — this app is `private` and listed in `.changeset/config.json` `ignore`, so it is excluded from Changesets versioning and from npm publish on both stable and alpha releases.

Workshop for `@xndrjs/resource-graph-resolver` with a Contentful-shaped content model: offline CMA snapshots, `contentful-to-zod` schemas, source-qualified ARIs (`cms.*` / `integration.*`), content-type expansion policies (current resource + payload + execution context), correlated `{ resource, payload }` loaders, and domain-zod aggregation.

Two orchestration entry points: `resolveBarrierDemoPage` and `resolveLaneDemoPage` (optional `signal`). Routes: `/[locale]/barrier` and `/[locale]/lane`. CMS/integration loaders short-circuit with an empty result when every `take()` is empty (no IO).

### Walk strategies

| Route               | Engine                             | Wiring                                                             | Behavior                                                                                                                                                 |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/[locale]/barrier` | `BarrierResolveContentGraphEngine` | `createDemoDataGateway` merges CMS + integration                   | One barrier round: wait for the gateway `process`, then expand. Wall-clock tracks the **slowest** source in that wave.                                   |
| `/[locale]/lane`    | `LaneResolveContentGraphEngine`    | ordered `[cms, integration]` `ResourceLoader`s (`accepts` routing) | **Serial per loader** (at most one in-flight `process` per lane). Lanes may overlap; a fast CMS lane can batch again while integration is still pending. |

Both produce the same island / `ContentMap` semantics. Prefer barrier for simple gateway composition and round traces; prefer lane when source latencies diverge and you want expand to proceed per lane. Terminal traces say “Barrier round” vs “Lane batch” so the two schedulers are not conflated.

### Simulated network latency

CMS and integration loaders accept `latencyMs` to delay each mock fetch. Orchestration resolves values as: `ResolveDemoPageOptions` → env → defaults (`0` under Vitest / `quiet`, otherwise CMS `80ms` and integration `350ms` so lane overlap is visible in the terminal).

| Knob                   | Env                           | Effect                                      |
| ---------------------- | ----------------------------- | ------------------------------------------- |
| `cmsLatencyMs`         | `DEMO_CMS_LATENCY_MS`         | Delay per CMS entries/assets fetch          |
| `integrationLatencyMs` | `DEMO_INTEGRATION_LATENCY_MS` | Delay per integration products-by-sku fetch |

Example:

```bash
DEMO_CMS_LATENCY_MS=50 DEMO_INTEGRATION_LATENCY_MS=400 pnpm --filter @xndrjs/resource-graph-resolver-demo dev
```

Lane terminal traces include relative timestamps (`T+…ms`), `▶` / `◀` batch markers, and the current in-flight loader set so overlapping CMS vs integration batches are easy to spot.

## Layout

```
app/                          # Next.js UI
  [locale]/barrier/           # barrier walk page
  [locale]/lane/         # lane walk page
src/
  domain/                     # domain-zod shapes
  orchestration/
    resolve-barrier-demo-page.ts    # gateway + BarrierResolveContentGraphEngine
    resolve-lane-demo-page.ts  # loaders + LaneResolveContentGraphEngine
    resolve-demo-shared.ts          # shared finalize (cache / aggregate)
  infrastructure/
    cms/                      # CMS source: ARIs, CMA snapshots, codegen, demo store, loader
      schema-fixtures/
        content-types.json    # normalized Contentful CMA snapshot (committed)
        locales.json          # en-US default, it-IT fallback
      contentful-to-zod.config.ts
      generated/
        contentful.schemas.ts   # Zod schemas from contentful-to-zod (committed)
      fixtures.ts             # in-memory Delivery-like demo store
    integration/              # Integration source: ARIs, catalog, commercial batch loader
    demo-data-gateway.ts      # engine DataResolutionPort: composes cms/integration process(pull)
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

`dev` runs the Next.js app: aggregated page + island cache in a split view; barrier rounds or lane batches are traced in the dev server terminal depending on the route.
