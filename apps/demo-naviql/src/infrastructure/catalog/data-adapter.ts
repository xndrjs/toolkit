import { defineDataSourceFor, type DataSource } from "@xndrjs/naviql";

import {
  productAri,
  type ContentRegistry,
  type PageDetailExecutionContext,
  type ProductPayload,
  type ProductResource,
} from "../../generated/page-detail.js";
import { demoFixtureStore } from "../fixtures/store.js";

export const CATALOG_SOURCE_ID = "catalog";

type CatalogRecord = { resource: ProductResource; payload: ProductPayload };

const defineCatalogSource = defineDataSourceFor<ContentRegistry, PageDetailExecutionContext>();

/** Commerce source: owns `productAri`. */
export function createCatalogSource(
  store: ReadonlyMap<string, unknown> = demoFixtureStore
): DataSource<ContentRegistry, PageDetailExecutionContext> {
  return defineCatalogSource({
    id: CATALOG_SOURCE_ID,
    for: [productAri],
    async load(batch) {
      const records: CatalogRecord[] = [];
      for (const resource of batch) {
        const payload = store.get(resource.toString());
        if (payload !== undefined) {
          records.push({ resource, payload: payload as ProductPayload });
        }
      }
      return records;
    },
  });
}
