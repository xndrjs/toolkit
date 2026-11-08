import { adapter } from "@xndrjs/forma";
import { PageBuilder, ResolvePage } from "../boundaries/page-builder";
import { ResolvePaths } from "../boundaries/routing";

const PageBuilderRouting = adapter("page-builder-routing", PageBuilder);

/** Translation stays explicit because PageBuilder owns a different contract. */
export const ResolvePageViaRoutingProvider = PageBuilderRouting.adapt(ResolvePage)
  .using({ resolvePaths: ResolvePaths })
  .with(
    ({ deps: { resolvePaths }, out }) =>
      async function resolvePage(page) {
        const outcome = await resolvePaths({ pageIds: [page.pageId] });
        switch (outcome.kind) {
          case "success": {
            const resolved = outcome.value[0];
            return resolved
              ? out.success({
                  id: resolved.pageId,
                  canonicalPath: resolved.canonicalPath,
                })
              : out.unexpectedFailure();
          }
          case "expectedError":
            return out.expectedError({ code: "page_not_found" });
          default:
            return outcome;
        }
      }
  );
