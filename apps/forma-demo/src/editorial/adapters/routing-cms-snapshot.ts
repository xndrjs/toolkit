import { adapter } from "@xndrjs/forma";
import { ReadSnapshot } from "../boundaries/cms-snapshot";
import { ResolvePaths, Routing } from "../boundaries/routing";

const RoutingCmsSnapshot = adapter("routing-cms-snapshot", Routing);

export const ResolvePathsViaCmsSnapshotProvider = RoutingCmsSnapshot.adapt(ResolvePaths)
  .using({ readSnapshot: ReadSnapshot })
  .with(
    ({ deps: { readSnapshot }, out }) =>
      async function resolvePaths({ pageIds }) {
        const outcome = await readSnapshot();
        switch (outcome.kind) {
          case "success": {
            const entriesById = new Map(
              outcome.value.map((entry) => [entry.entry_id, entry] as const)
            );
            const resolved: { readonly pageId: string; readonly canonicalPath: string }[] = [];
            const unresolvedPageIds: string[] = [];
            for (const pageId of pageIds) {
              const entry = entriesById.get(pageId);
              if (entry) {
                resolved.push({ pageId, canonicalPath: entry.canonical_path });
              } else {
                unresolvedPageIds.push(pageId);
              }
            }
            return out.success({ resolved, unresolvedPageIds });
          }
          default:
            return outcome;
        }
      }
  );
