import { aliasIntent, compose } from "@xndrjs/forma";
import { ResolvePageViaRoutingProvider } from "./adapters/page-builder-routing";
import { ResolvePathViaCmsSnapshotProvider } from "./adapters/routing-cms-snapshot";
import { FindSnapshotEntryProvider } from "./boundaries/cms-snapshot";
import { CreatePagePreviewProvider, PageBuilder } from "./boundaries/page-builder";
import { ResolvePath } from "./boundaries/routing";
import { GetSitemapEntryProvider, Sitemap, SitemapResolvePath } from "./boundaries/sitemap";

export function composeEditorial() {
  return compose({
    entryBoundaries: [Sitemap, PageBuilder],
    surface: {
      getSitemapEntry: GetSitemapEntryProvider,
      createPagePreview: CreatePagePreviewProvider,
    },
    wiring: [
      aliasIntent(SitemapResolvePath, ResolvePath),
      ResolvePageViaRoutingProvider,
      ResolvePathViaCmsSnapshotProvider,
      FindSnapshotEntryProvider,
    ],
  });
}
