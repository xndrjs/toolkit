import { describe, expect, it } from "vitest";

import {
  DEMO_MARKET,
  DEMO_MEDIA_ID,
  DEMO_PRODUCT_ID,
  DEMO_TENANT,
} from "../infrastructure/fixtures/commerce-store.js";
import { DEMO_LOCALE } from "../infrastructure/fixtures/cms-store.js";
import { parseDemoProductIdParam, resolveProduct } from "./resolve-product.js";

describe("resolveProduct", () => {
  it("assembles catalog, price, stock, and media from separate backends", async () => {
    const { productDetail, contentMap, errors, context } = await resolveProduct({
      productId: DEMO_PRODUCT_ID,
      market: DEMO_MARKET,
      locale: DEMO_LOCALE,
      tenantId: DEMO_TENANT,
    });

    expect(errors).toEqual([]);
    expect(context).toMatchObject({
      productId: DEMO_PRODUCT_ID,
      market: DEMO_MARKET,
      locale: DEMO_LOCALE,
      tenantId: DEMO_TENANT,
      schedulingMode: "lane",
    });
    expect(contentMap.size).toBeGreaterThan(0);
    expect(productDetail).toMatchObject({
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

  it("maps the demo product route id onto the fixture catalog id", () => {
    expect(parseDemoProductIdParam(DEMO_PRODUCT_ID)).toBe(DEMO_PRODUCT_ID);
    expect(parseDemoProductIdParam("unknown")).toBeNull();
  });
});
