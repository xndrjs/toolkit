import { integrationProductAri } from "./ari.js";
import { demoProductSku } from "./catalog.js";

/** Demo ARI for the commercial snapshot of the CMS product SKU (default locale). */
export const tshirtIntegrationAri = integrationProductAri({
  sku: demoProductSku,
  locale: "en-US",
});
