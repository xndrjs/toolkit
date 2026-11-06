import { adapter } from "@xndrjs/forma";
import { EnumeratePublishedPages } from "../boundaries/content-catalog";
import { ResolvePaths } from "../boundaries/routing";
import { EnumerateSitemapEntries, Sitemap } from "../boundaries/sitemap";

const SitemapCatalogRouting = adapter("sitemap-catalog-routing", Sitemap);

/** Sitemap keeps its local port while ContentCatalog and Routing retain their own vocabularies. */
export const EnumerateSitemapEntriesViaCatalogAndRoutingProvider = SitemapCatalogRouting.adapt(
  EnumerateSitemapEntries
)
  .using({ enumeratePublishedPages: EnumeratePublishedPages, resolvePaths: ResolvePaths })
  .with(
    ({ deps: { enumeratePublishedPages, resolvePaths }, out }) =>
      async function enumerateSitemapEntries() {
        const pagesOutcome = await enumeratePublishedPages();
        if (pagesOutcome.kind !== "success") return pagesOutcome;

        const pathsOutcome = await resolvePaths({
          pageIds: pagesOutcome.value.map((page) => page.pageId),
        });
        switch (pathsOutcome.kind) {
          case "success": {
            const pathsByPageId = new Map(
              pathsOutcome.value.map((path) => [path.pageId, path] as const)
            );
            const entries = [];
            for (const page of pagesOutcome.value) {
              const path = pathsByPageId.get(page.pageId);
              if (!path) return out.unexpectedFailure();
              entries.push({
                location: path.canonicalPath,
                lastModifiedAt: page.lastModifiedAt,
              });
            }
            return out.success(entries);
          }
          case "expectedError":
            return out.unexpectedFailure();
          default:
            return pathsOutcome;
        }
      }
  );
