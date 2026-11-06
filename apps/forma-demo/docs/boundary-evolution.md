# Boundary evolution: Sitemap, ContentCatalog, PageBuilder, and Routing

This walkthrough captures a common architectural discovery: related capabilities begin behind
consumer-owned ports, then acquire enough independent meaning to deserve their own owner.

## 1. Initial ownership

Sitemap initially owns a public use case and the private port required to implement it:

```text
Sitemap.GenerateSitemapUseCase
└─ Sitemap.EnumerateSitemapEntries
```

This is a good initial design. Sitemap asks for entries in its own language, and there is no
evidence yet that path resolution deserves an independent architectural identity.

## 2. New pressure

PageBuilder later needs to resolve an editorial path. Copying route rules and CMS translation would
let them drift independently. Depending directly on a Sitemap use case would also give PageBuilder
the wrong architectural vocabulary.

The new pressure reveals a shared path-resolution capability. Routing becomes its owner and
exposes `ResolvePaths` for resolving page IDs in batches and `ResolvePath` for matching one
incoming path.

Routing does not decide which pages exist or should be published. `ContentCatalog` owns that
language and exposes `EnumeratePublishedPages`. This keeps enumeration out of Routing and gives
the Sitemap Adapter the two explicit inputs it needs.

## 3. Consumer-owned ports remain local

The runnable demo keeps each consumer's seam in its own Boundary:

```text
Sitemap.EnumerateSitemapEntries ── Adapter ─┬─> ContentCatalog.EnumeratePublishedPages
                                            └─> Routing.ResolvePaths
PageBuilder.ResolvePage ── Adapter ──> Routing.ResolvePath
```

`GenerateSitemapProvider` still depends only on `EnumerateSitemapEntries`.
`SitemapCatalogRouting` realizes that port by combining published page IDs and modification
timestamps from ContentCatalog with canonical paths from Routing. The Adapter returns values in
Sitemap's vocabulary; neither external Boundary needs to know what a sitemap entry is.

PageBuilder owns its local seam and vocabulary:

```text
{ pathname } -> { id, canonicalPath } | page_not_found
```

Routing speaks a different contract:

```text
{ path } -> { pageId, canonicalPath } | route_not_found
{ pageIds } -> [{ pageId, canonicalPath }] | route_not_found
```

`PageBuilderRouting` therefore maps input, success, and Expected Error. Unexpected Failure and
Cancellation pass through unchanged. If either side evolves, the translation remains local to the
Adapter instead of leaking into the use case.

## 4. Technology stays behind its own Boundary

ContentCatalog and Routing do not read a file or know a CMS record shape.
`CmsSnapshot.ReadSnapshot` owns the local artifact format, while `ContentCatalogCmsSnapshot` and
`RoutingCmsSnapshot` realize their respective capabilities from it.

The demo uses a real JSON artifact because it can run without credentials or infrastructure. It is
named `CmsSnapshot`, not after a remote vendor it does not actually integrate. A production
composition could instead register a Contentful, Sanity, Strapi, database, or remote-service
realization without changing Sitemap or PageBuilder.

## 5. The resulting graph

The important property is that discovering Routing does not force either consumer to adopt its
contract directly:

1. `GenerateSitemapUseCase` still depends on a Sitemap-owned port;
2. `CreatePagePreviewUseCase` still depends on a PageBuilder-owned port;
3. Content enumeration and path resolution have separate owners;
4. Adapters make every crossing explicit;
5. each realization can move away from the snapshot without changing either use case.

Forma keeps the resulting graph closed, typed, inspectable, and runnable.
