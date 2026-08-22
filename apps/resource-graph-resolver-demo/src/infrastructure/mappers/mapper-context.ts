import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import type { ResolveContentGraphOutput } from "@xndrjs/resource-graph-resolver";

import type { DemoContentRegistry } from "../content-registry.js";
import type { ContentfulLocaleCode } from "../cms/generated/contentful.schemas.js";

export type MapperContext = {
  result: ResolveContentGraphOutput<DemoContentRegistry>;
  locale: ContentfulLocaleCode;
};

export function requireCmsEntry(
  context: MapperContext,
  resource: ApplicationResourceIdentifier<"cms.entry">
) {
  const raw = context.result.contentMap.get(resource);
  if (!raw) {
    throw new Error(`ContentMap is missing cms.entry ${resource.format()}`);
  }
  return raw;
}
