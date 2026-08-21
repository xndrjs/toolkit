import { ari } from "@xndrjs/application-resources";

/** Integration product commercial data, keyed by SKU. */
export function integrationProductAri(sku: string) {
  return ari("integration.product", { sku });
}
