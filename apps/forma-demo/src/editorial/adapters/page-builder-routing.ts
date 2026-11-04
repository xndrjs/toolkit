import { adapter } from "@xndrjs/forma";
import { PageBuilder, ResolvePage } from "../boundaries/page-builder";
import { ResolvePath } from "../boundaries/routing";

const PageBuilderRouting = adapter("page-builder-routing", PageBuilder);

/** Translation stays explicit because PageBuilder owns a different contract. */
export const ResolvePageViaRoutingProvider = PageBuilderRouting.adapt(ResolvePage)
  .using({ resolvePath: ResolvePath })
  .with(
    ({ deps: { resolvePath }, out }) =>
      async function resolvePage(path) {
        const outcome = await resolvePath({ path: path.pathname });
        switch (outcome.kind) {
          case "success":
            return out.success({
              id: outcome.value.pageId,
              canonicalPath: outcome.value.canonicalPath,
            });
          case "expectedError":
            return out.expectedError({ code: "page_not_found" });
          default:
            return outcome;
        }
      }
  );
