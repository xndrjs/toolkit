import { ari, s } from "@xndrjs/addressable-resources";

/** Integration product commercial data, keyed by SKU and locale. */
export const integrationProductAri = ari(
  "integration.product",
  s.object({ sku: s.string(), locale: s.string() })
);

export type IntegrationProductResource = ReturnType<typeof integrationProductAri>;
