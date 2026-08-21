import { defineAri, s } from "@xndrjs/application-resources";

/** Integration product commercial data, keyed by SKU. */
export const integrationProductAri = defineAri(
  "integration.product",
  s.tuple([s.object({ sku: s.string() })])
);
