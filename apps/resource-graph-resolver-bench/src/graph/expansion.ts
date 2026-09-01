import { createStrategy, type GraphStrategy } from "@xndrjs/resource-graph-resolver";

import { benchNodeAri, benchProductAri } from "./ari";
import type { BenchContentRegistry } from "./generate";

/**
 * Cold-path expansion for generated graphs (regular tree or pagebuilder):
 * internal CMS nodes → child nodes; CMS leaves (empty `children`) → one
 * `bench.product` with the same id as SKU.
 *
 * Never declares island boundaries (scheduler bench only; islands are out of scope).
 */
export function createBenchStrategy(): GraphStrategy<BenchContentRegistry> {
  const s = createStrategy<unknown, BenchContentRegistry>();

  s.expansion.on(benchNodeAri).expand(({ resource, payload }) => {
    if (payload.children.length > 0) {
      return {
        resources: payload.children.map((id) => benchNodeAri({ id })),
      };
    }

    return {
      resources: [benchProductAri({ sku: resource.key[0].id })],
    };
  });

  return s.build();
}
