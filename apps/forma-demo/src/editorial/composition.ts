import { compose } from "@xndrjs/forma";
import { EnumeratePublishedPagesViaCmsSnapshotProvider } from "./adapters/content-catalog-cms-snapshot";
import { ResolvePageViaRoutingProvider } from "./adapters/page-builder-routing";
import {
  ResolvePathViaCmsSnapshotProvider,
  ResolvePathsViaCmsSnapshotProvider,
} from "./adapters/routing-cms-snapshot";
import { EnumerateSitemapEntriesViaCatalogAndRoutingProvider } from "./adapters/sitemap-catalog-routing";
import { ReadSnapshotProvider } from "./boundaries/cms-snapshot";
import { CreatePagePreviewProvider, PageBuilder } from "./boundaries/page-builder";
import { GenerateSitemapProvider, Sitemap } from "./boundaries/sitemap";

export function composeEditorial() {
  return compose({
    entryBoundaries: [Sitemap, PageBuilder],
    surface: {
      generateSitemap: GenerateSitemapProvider,
      createPagePreview: CreatePagePreviewProvider,
    },
    wiring: [
      EnumerateSitemapEntriesViaCatalogAndRoutingProvider,
      ResolvePageViaRoutingProvider,
      EnumeratePublishedPagesViaCmsSnapshotProvider,
      ResolvePathsViaCmsSnapshotProvider,
      ResolvePathViaCmsSnapshotProvider,
      ReadSnapshotProvider,
    ],
  });
}
