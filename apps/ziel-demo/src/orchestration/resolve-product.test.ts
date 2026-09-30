import { describe, expect, it } from "vitest";

import { resolveDemoProductDetail } from "../infrastructure/demo-resolver.js";
import {
  DEMO_MARKET,
  DEMO_MEDIA_ID,
  DEMO_PRODUCT_ID,
  DEMO_TENANT,
} from "../infrastructure/fixtures/commerce-store.js";
import { DEMO_LOCALE } from "../infrastructure/fixtures/store.js";

describe("resolveDemoProductDetail", () => {
  it("assembles catalog, price, stock, and media from separate backends", async () => {
    const result = await resolveDemoProductDetail({
      params: { productId: DEMO_PRODUCT_ID },
      executionContext: {
        market: DEMO_MARKET,
        locale: DEMO_LOCALE,
        tenantId: DEMO_TENANT,
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.productDetail).toMatchObject({
      id: DEMO_PRODUCT_ID,
      title: "Organic tee",
      price: {
        amountCents: 2990,
        currency: "EUR",
      },
      stock: {
        available: 42,
      },
      media: {
        id: DEMO_MEDIA_ID,
        url: "https://cdn.example/tee-front.webp",
      },
    });
  });
});
