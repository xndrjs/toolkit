import type { GraphResolutionStrategy } from "@xndrjs/naviql";

import {
  assetAri,
  createPageDetailStrategy,
  editorialModuleAri,
  productAri,
  tabCollectionAri,
  type ContentRegistry,
  type PageDetailExecutionContext,
  type PageDetailParams,
} from "../generated/page-detail.js";

/**
 * Wraps `createPageDetailStrategy` and `.build()`.
 *
 * Codegen emits `.on(heroAri)` / `.on(tabsAri)`, but page strips request
 * `editorialModuleAri`. Until the emitter mirrors union-member expansions onto
 * the union ARI (and fan-out from `TabCollection`), the demo attaches those
 * policies here — still no islands.
 */
export function createDemoPageStrategy(
  params: PageDetailParams
): GraphResolutionStrategy<ContentRegistry, PageDetailExecutionContext> {
  const strategy = createPageDetailStrategy(params);

  strategy.expansion.on(editorialModuleAri).expand(({ payload, executionContext }) => {
    switch (payload.type) {
      case "Hero":
        return {
          resources: [assetAri({ id: payload.imageId, locale: executionContext.locale })],
        };
      case "Tabs":
        return {
          resources: [tabCollectionAri({ tabsId: payload.id, locale: executionContext.locale })],
        };
      case "Product":
        return {
          resources: [productAri({ id: payload.id, locale: executionContext.locale })],
        };
      default: {
        const _exhaustive: never = payload;
        return _exhaustive;
      }
    }
  });

  strategy.expansion.on(tabCollectionAri).expand(({ payload, executionContext }) => ({
    resources: payload.flatMap((tab) =>
      tab.strips.map((strip) =>
        editorialModuleAri({ id: strip.id, locale: executionContext.locale })
      )
    ),
  }));

  return strategy.build();
}
