import { ari, s } from "@xndrjs/application-resources";

/** Synthetic CMS tree node for scheduler benches. */
export const benchNodeAri = ari("bench.node", s.object({ id: s.string() }));
export type BenchNodeResource = ReturnType<typeof benchNodeAri>;

/** Synthetic integration product leaf (1:1 with each CMS leaf). */
export const benchProductAri = ari("bench.product", s.object({ sku: s.string() }));
export type BenchProductResource = ReturnType<typeof benchProductAri>;
