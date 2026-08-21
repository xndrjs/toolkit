import type { ProductIntegrationSnapshot } from "./catalog.js";

/** ContentRegistry slice owned by the integration source adapter. */
export type IntegrationContentRegistry = {
  "integration.product": ProductIntegrationSnapshot;
};
