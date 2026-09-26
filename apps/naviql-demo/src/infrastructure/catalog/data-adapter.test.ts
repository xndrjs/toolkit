import { describe, expect, it } from "vitest";

import { productAri } from "../../generated/page-detail.js";
import { DEMO_LOCALE, demoIds } from "../fixtures/store.js";
import { CATALOG_SOURCE_ID, createCatalogSource } from "./data-adapter.js";

const locale = DEMO_LOCALE;
const loadContext = { executionContext: { locale }, batchNumber: 1 };

describe("createCatalogSource", () => {
  it("owns only productAri", () => {
    const source = createCatalogSource();
    expect(source.id).toBe(CATALOG_SOURCE_ID);
    expect(source.for.map((family) => family.type)).toEqual(["Product"]);
  });

  it("returns product fixtures and omits unknown keys", async () => {
    const source = createCatalogSource();
    const known = productAri({ id: demoIds.productTshirt, locale });
    const missing = productAri({ id: "missing-product", locale });

    const records = await source.load([known, missing], loadContext);

    expect(records).toHaveLength(1);
    expect(records[0]?.resource.toString()).toBe(known.toString());
    expect(records[0]?.payload).toMatchObject({
      type: "Product",
      id: demoIds.productTshirt,
      sku: "TSHIRT-1",
    });
  });
});
