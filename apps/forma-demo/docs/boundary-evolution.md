# Boundary evolution: Sitemap, PageBuilder, and Routing

This walkthrough captures a common architectural discovery: a capability starts inside one
Boundary, then acquires enough independent meaning to deserve its own owner.

## 1. Initial ownership

Sitemap originally owns both the public use case and the private route-resolution seam:

```text
Sitemap.GetSitemapEntryUseCase
└─ Sitemap.ResolveSitemapPath
```

This is a good initial design. `ResolvePath` has one consumer and there is no evidence yet that it
is a shared capability.

## 2. New pressure

PageBuilder later needs to resolve an editorial path. Copying Sitemap's implementation would make
route rules, failure handling, and CMS translation drift independently. Depending directly on a
Sitemap use case would also give PageBuilder the wrong architectural vocabulary.

The repeated responsibility is extracted into `Routing.ResolvePath` and its implementation moves
behind that Intent.

## 3. Incremental migration

The runnable demo represents the migration state:

```text
Sitemap.ResolveSitemapPath ── aliasIntent ──> Routing.ResolvePath

PageBuilder.ResolvePage ── Adapter ──> Routing.ResolvePath
```

The two connections intentionally mean different things.

### Sitemap uses an Intent alias

The historical Sitemap Intent and the new Routing Intent have exactly equivalent input, success,
expected-error, and modality contracts. During migration they are deliberate synonyms.

```ts
aliasIntent(ResolveSitemapPath, ResolvePath);
```

The existing `GetSitemapEntryProvider` remains unchanged while the realization moves. The alias is
explicit migration debt, not the default way to connect Boundaries.

### PageBuilder uses an Adapter

PageBuilder owns its local seam and vocabulary:

```text
{ pathname } -> { id, canonicalPath } | page_not_found
```

Routing speaks a different contract:

```text
{ path } -> { pageId, canonicalPath } | route_not_found
```

`PageBuilderRouting` therefore maps input, success, and Expected Error. Unexpected Failure and
Cancellation pass through unchanged. If either side evolves, the translation remains local to the
Adapter instead of leaking into the use case.

## 4. Technology stays behind its own Boundary

Routing does not read a file or know a CMS record shape. `CmsSnapshot` owns the local artifact
format, and `RoutingCmsSnapshot` translates it into Routing language.

The demo uses a real JSON artifact because it can run without credentials or infrastructure. It is
named `CmsSnapshot`, not after a remote vendor it does not actually integrate. A production
composition could instead register a Contentful, Sanity, Strapi, database, or remote-service
realization without changing Sitemap or PageBuilder.

## 5. Final cleanup

Once the ownership move is established, replace the migration alias with a `SitemapRouting`
Adapter. The Adapter may initially be a passthrough because the contracts are equivalent, but it
makes the cross-Boundary edge and its direction explicit.

`Sitemap.ResolveSitemapPath` remains the consumer-owned local seam used by
`GetSitemapEntryProvider`.
Forma Boundary Providers depend only on Intents from their own Boundary; cross-Boundary traversal
belongs in an Adapter. The local Intent can disappear only if Sitemap no longer needs route
resolution or if its use case is redesigned, not merely because Routing owns the shared
realization.

The important property is that the migration does not require a big-bang rewrite:

1. introduce `Routing.ResolvePath`;
2. move the realization;
3. bridge the unchanged consumer with an Intent alias;
4. connect semantically different consumers with Adapters;
5. replace the temporary alias with a Sitemap-to-Routing Adapter when convenient.

Forma makes each intermediate graph closed, typed, inspectable, and runnable.
