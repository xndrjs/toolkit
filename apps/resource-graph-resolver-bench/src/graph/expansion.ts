import {
  createExpansionPolicyChain,
  defineExpansionPolicy,
  type ExpansionPort,
} from "@xndrjs/resource-graph-resolver";

import { benchNodeAri, benchProductAri } from "./ari";
import type { BenchContentRegistry } from "./generate";

/**
 * Cold-path expansion for generated trees: internal CMS nodes → child nodes;
 * CMS leaves → one `bench.product` with the same id as SKU.
 *
 * Never sets `isIsland` (scheduler bench only; islands are out of scope).
 */
export function createBenchExpansionPort(): ExpansionPort<BenchContentRegistry> {
  return createExpansionPolicyChain<BenchContentRegistry>([
    defineExpansionPolicy<ReturnType<typeof benchNodeAri>, BenchContentRegistry>({
      for: benchNodeAri,
      expand: ({ resource, payload }) => {
        if (payload.children.length > 0) {
          return {
            resources: payload.children.map((id) => benchNodeAri({ id })),
          };
        }

        return {
          resources: [benchProductAri({ sku: resource.key[0].id })],
        };
      },
    }),
  ]);
}
