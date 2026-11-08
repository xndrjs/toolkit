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
        return out.match(pagesOutcome, {
          success: async (pages) => {
            const pathsOutcome = await resolvePaths({
              pageIds: pages.map((page) => page.pageId),
            });
            return out.match(pathsOutcome, {
              success: ({ resolved, unresolvedPageIds }) => {
                if (unresolvedPageIds.length > 0) return out.unexpectedFailure();

                const pathsByPageId = new Map(resolved.map((path) => [path.pageId, path] as const));
                const entries = [];
                for (const page of pages) {
                  const path = pathsByPageId.get(page.pageId);
                  if (!path) return out.unexpectedFailure();
                  entries.push({
                    location: path.canonicalPath,
                    lastModifiedAt: page.lastModifiedAt,
                  });
                }
                return out.success(entries);
              },
            });
          },
        });
      }
  );
