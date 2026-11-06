import { adapter } from "@xndrjs/forma";
import { ReadSnapshot } from "../boundaries/cms-snapshot";
import { ResolvePath, ResolvePaths, Routing } from "../boundaries/routing";

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
            const routes: { readonly pageId: string; readonly canonicalPath: string }[] = [];
            for (const pageId of pageIds) {
              const entry = entriesById.get(pageId);
              if (!entry) return out.expectedError({ code: "route_not_found", pageId });
              routes.push({ pageId, canonicalPath: entry.canonical_path });
            }
            return out.success(routes);
          }
          default:
            return outcome;
        }
      }
  );

export const ResolvePathViaCmsSnapshotProvider = RoutingCmsSnapshot.adapt(ResolvePath)
  .using({ readSnapshot: ReadSnapshot })
  .with(
    ({ deps: { readSnapshot }, out }) =>
      async function resolvePath(path) {
        const outcome = await readSnapshot();
        switch (outcome.kind) {
          case "success": {
            const entry = outcome.value.find((candidate) => candidate.canonical_path === path.path);
            return entry
              ? out.success({
                  pageId: entry.entry_id,
                  canonicalPath: entry.canonical_path,
                })
              : out.expectedError({ code: "route_not_found" });
          }
          default:
            return outcome;
        }
      }
  );
