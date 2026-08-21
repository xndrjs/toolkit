# @xndrjs/resource-graph-resolver-demo

**Not published** — this app is `private` and listed in `.changeset/config.json` `ignore`, so it is excluded from Changesets versioning and from npm publish on both stable and alpha releases.

Workshop for `@xndrjs/resource-graph-resolver` with a Contentful-shaped content model: offline CMA snapshots, `contentful-to-zod` schemas, opaque `entry`/`asset` ARIs with an in-memory CMS store, then (next) content-type expansion and domain-zod aggregation.

## Layout

```
fixtures/
  content-types.json      # normalized Contentful CMA snapshot (committed)
  locales.json            # en-US default, it-IT fallback
contentful-to-zod.config.ts
src/
  generated/
    contentful.schemas.ts # Zod schemas from contentful-to-zod (committed)
  ari.ts                  # opaque entry/asset ARI factories
  content-registry.ts     # weak ContentRegistry (entry/asset → mock CMS envelopes)
  mock-contentful-types.ts # MOCK Contentful Delivery shapes + Link helpers (not generated)
  demo-content-fixtures.ts # in-memory CMS store (ids, ARIs, payloads)
  in-memory-data-port.ts  # DataResolutionPort over the store
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
