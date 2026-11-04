import { adapter } from "@xndrjs/forma";
import { FindSnapshotEntry } from "../boundaries/cms-snapshot";
import { ResolvePath, Routing } from "../boundaries/routing";

const RoutingCmsSnapshot = adapter("routing-cms-snapshot", Routing);

export const ResolvePathViaCmsSnapshotProvider = RoutingCmsSnapshot.adapt(ResolvePath)
  .using({ findEntry: FindSnapshotEntry })
  .with(
    ({ deps: { findEntry }, out }) =>
      async function resolvePath(path) {
        const outcome = await findEntry({ route_path: path.path });
        switch (outcome.kind) {
          case "success":
            return out.success({
              pageId: outcome.value.entry_id,
              canonicalPath: outcome.value.canonical_path,
            });
          case "expectedError":
            return out.expectedError({ code: "route_not_found" });
          default:
            return outcome;
        }
      }
  );
