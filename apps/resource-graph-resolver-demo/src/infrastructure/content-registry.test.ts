import { describe, expect, expectTypeOf, it } from "vitest";

import {
  cmsEntryAri,
  createCmsDataAdapter,
  demoCmsStore,
  demoIds,
  heroEntryAri,
  logoAssetAri,
  menuEntryAri,
  pageEntryAri,
  productEntryAri,
  tabEntryAri,
  mockEntryLink,
  type MockContentfulAsset,
  type MockContentfulEntry,
} from "./cms/index.js";
import type { DemoContentRegistry } from "./content-registry.js";
import { createDemoDataGateway } from "./demo-data-gateway.js";
import {
  HeroEntrySchema,
  PageEntrySchema,
  ProductEntrySchema,
  TabEntrySchema,
} from "./generated/contentful.schemas.js";
import {
  createIntegrationDataAdapter,
  tshirtIntegrationAri,
  type ProductIntegrationSnapshot,
} from "./integration/index.js";

describe("source-qualified ARI store + data gateway", () => {
  it("uses cms.* and integration.* ARI types", () => {
    expect(pageEntryAri.type).toBe("cms.entry");
    expect(logoAssetAri.type).toBe("cms.asset");
    expect(tshirtIntegrationAri.type).toBe("integration.product");
    expectTypeOf(pageEntryAri.type).toEqualTypeOf<"cms.entry">();
    expectTypeOf(logoAssetAri.type).toEqualTypeOf<"cms.asset">();
    expectTypeOf(tshirtIntegrationAri.type).toEqualTypeOf<"integration.product">();
  });

  it("types ContentRegistry by source-qualified ARI type", () => {
    expectTypeOf<DemoContentRegistry["cms.entry"]>().toEqualTypeOf<MockContentfulEntry>();
    expectTypeOf<DemoContentRegistry["cms.asset"]>().toEqualTypeOf<MockContentfulAsset>();
    expectTypeOf<
      DemoContentRegistry["integration.product"]
    >().toEqualTypeOf<ProductIntegrationSnapshot>();
  });

  it("stores CMS Link stubs instead of $ref ARI strings", () => {
    const page = demoCmsStore.entries.get(demoIds.page)!;

    expect(page.fields.menu).toEqual(mockEntryLink(demoIds.menu));
    expect(page.fields.modules).toEqual([
      mockEntryLink(demoIds.tabs),
      mockEntryLink(demoIds.product),
    ]);
    expect(JSON.stringify(page)).not.toContain("$ref");
  });

  it("keeps delivery-shaped entries parseable by generated schemas", () => {
    expect(PageEntrySchema.parse(demoCmsStore.entries.get(demoIds.page))).toMatchObject({
      sys: { id: demoIds.page, contentType: { sys: { id: "page" } } },
    });
    expect(TabEntrySchema.parse(demoCmsStore.entries.get(demoIds.tab)).fields.strips).toEqual([
      mockEntryLink(demoIds.hero),
      mockEntryLink(demoIds.product),
    ]);
    expect(HeroEntrySchema.parse(demoCmsStore.entries.get(demoIds.hero)).fields.image).toEqual({
      sys: { type: "Link", linkType: "Asset", id: demoIds.logo },
    });
    expect(ProductEntrySchema.parse(demoCmsStore.entries.get(demoIds.product)).fields.sku).toBe(
      "TSHIRT-1"
    );
  });

  it("gateway routes cms and integration batches to the injected adapters", async () => {
    const gateway = createDemoDataGateway(
      createCmsDataAdapter(demoCmsStore),
      createIntegrationDataAdapter()
    );
    const missing = cmsEntryAri({ id: "missing-entry" });

    const result = await gateway.resolve([
      pageEntryAri,
      logoAssetAri,
      missing,
      menuEntryAri,
      tshirtIntegrationAri,
    ]);

    expect(result.size).toBe(4);
    expect(result.has(pageEntryAri.format())).toBe(true);
    expect(result.has(logoAssetAri.format())).toBe(true);
    expect(result.has(menuEntryAri.format())).toBe(true);
    expect(result.has(tshirtIntegrationAri.format())).toBe(true);
    expect(result.has(missing.format())).toBe(false);

    const asset = result.get(logoAssetAri.format()) as MockContentfulAsset;
    expect(asset.fields.file.url).toBe("https://cdn.example.com/logo.svg");

    const commercial = result.get(tshirtIntegrationAri.format()) as ProductIntegrationSnapshot;
    expect(commercial).toEqual({
      price: { amount: 1999, currency: "EUR" },
      inStock: true,
    });
  });

  it("cms adapter batches entry and asset ids (Contentful-style)", async () => {
    const cms = createCmsDataAdapter(demoCmsStore);
    const result = await cms.resolve([pageEntryAri, heroEntryAri, logoAssetAri, productEntryAri]);

    expect([...result.keys()].sort()).toEqual(
      [
        pageEntryAri.format(),
        heroEntryAri.format(),
        logoAssetAri.format(),
        productEntryAri.format(),
      ].sort()
    );
  });

  it("integration adapter batches product skus", async () => {
    const integration = createIntegrationDataAdapter();
    const result = await integration.resolve([tshirtIntegrationAri]);

    expect(result.get(tshirtIntegrationAri.format())).toEqual({
      price: { amount: 1999, currency: "EUR" },
      inStock: true,
    });
  });
});
