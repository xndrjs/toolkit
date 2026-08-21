# @xndrjs/resource-graph-resolver-demo

**Not published** — this app is `private` and listed in `.changeset/config.json` `ignore`, so it is excluded from Changesets versioning and from npm publish on both stable and alpha releases.

Workshop for `@xndrjs/resource-graph-resolver` with a Contentful-shaped content model: offline CMA snapshots, `contentful-to-zod` schemas, source-qualified ARIs (`cms.*` / `integration.*`), content-type expansion policies, and domain-zod aggregation.

## Layout

```
fixtures/
  content-types.json      # normalized Contentful CMA snapshot (committed)
  locales.json            # en-US default, it-IT fallback
contentful-to-zod.config.ts
src/
  domain/                     # domain-zod shapes
  infrastructure/
    generated/
      contentful.schemas.ts   # Zod schemas from contentful-to-zod (committed)
    cms/                      # CMS source: ARIs, fixtures, Contentful-like batch adapter
    integration/              # Integration source: ARIs, catalog, commercial batch adapter
    data-resolution-adapter.ts
    demo-data-gateway.ts      # DataResolutionPort: routes cms.* / integration.* to adapters
    content-registry.ts       # DemoContentRegistry = CMS ∪ integration slices
    expansion-policies.ts     # expand by content-type; product → integration.product
    aggregate-page-graph.ts   # ContentMap → domain-zod (no integration port)
```

## Contentful schema codegen

Offline snapshot → Zod (no CMA). After editing `fixtures/content-types.json` or `fixtures/locales.json`:

```bash
pnpm --filter @xndrjs/resource-graph-resolver-demo contentful:schema
```

## Run checks

```bash
pnpm --filter @xndrjs/resource-graph-resolver-demo typecheck
pnpm --filter @xndrjs/resource-graph-resolver-demo test
```
