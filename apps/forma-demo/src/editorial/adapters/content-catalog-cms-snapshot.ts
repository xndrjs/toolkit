import { adapter } from "@xndrjs/forma";
import { ReadSnapshot } from "../boundaries/cms-snapshot";
import { ContentCatalog, EnumeratePublishedPages } from "../boundaries/content-catalog";

const ContentCatalogCmsSnapshot = adapter("content-catalog-cms-snapshot", ContentCatalog);

export const EnumeratePublishedPagesViaCmsSnapshotProvider = ContentCatalogCmsSnapshot.adapt(
  EnumeratePublishedPages
)
  .using({ readSnapshot: ReadSnapshot })
  .with(
    ({ deps: { readSnapshot }, out }) =>
      async function enumeratePublishedPages() {
        const outcome = await readSnapshot();
        switch (outcome.kind) {
          case "success":
            return out.success(
              outcome.value
                .filter((entry) => entry.publication_state === "published")
                .map((entry) => ({
                  pageId: entry.entry_id,
                  lastModifiedAt: entry.last_modified_at,
                }))
            );
          default:
            return outcome;
        }
      }
  );
