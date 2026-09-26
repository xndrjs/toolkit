import type { GraphResolutionStrategy } from "@xndrjs/naviql";

import {
  createPageDetailStrategy,
  type ContentRegistry,
  type PageDetailExecutionContext,
  type PageDetailParams,
} from "../generated";

/**
 * Wraps `createPageDetailStrategy` and `.build()`.
 *
 * Polymorphic `each` expands + collection fan-out are emitted by codegen;
 * no handwritten union glue.
 */
export function createDemoPageStrategy(
  params: PageDetailParams
): GraphResolutionStrategy<ContentRegistry, PageDetailExecutionContext> {
  return createPageDetailStrategy(params).build();
}
