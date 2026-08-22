import { describe, expect, expectTypeOf, it } from "vitest";
import { createDataResolutionPull } from "@xndrjs/resource-graph-resolver";

import {
  cmsEntryAri,
  createCmsDataLoader,
  demoCmsStore,
  demoIds,
  heroEntryAri,
  logoAssetAri,
  menuEntryAri,
  pageEntryAri,
  productEntryAri,
  type ContentfulAsset,
  type ContentfulResolvedEntry,
} from "./cms/index.js";
import type { DemoContentRegistry } from "./content-registry.js";
import { createDemoDataGateway } from "./demo-data-gateway.js";
import {
  HeroEntrySchema,
  PageEntrySchema,
  ProductEntrySchema,
  TabEntrySchema,
} from "./cms/generated/contentful.schemas.js";
import {
  createIntegrationDataLoader,
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
    expectTypeOf<DemoContentRegistry["cms.entry"]>().toEqualTypeOf<ContentfulResolvedEntry>();
    expectTypeOf<DemoContentRegistry["cms.asset"]>().toEqualTypeOf<ContentfulAsset>();
    expectTypeOf<
      DemoContentRegistry["integration.product"]
    >().toEqualTypeOf<ProductIntegrationSnapshot>();
  });

  it("stores CMS Link stubs instead of $ref ARI strings", () => {
    const entry = demoCmsStore.entries.get(demoIds.page)!;
    const page = PageEntrySchema.parse(entry);

    expect(page.fields.menu).toEqual({
      sys: { type: "Link", linkType: "Entry", id: demoIds.menu },
    });
    expect(page.fields.modules).toEqual([
      { sys: { type: "Link", linkType: "Entry", id: demoIds.tabs } },
      { sys: { type: "Link", linkType: "Entry", id: demoIds.product } },
    ]);
    expect(JSON.stringify(page)).not.toContain("$ref");
  });

  it("keeps delivery-shaped entries parseable by generated schemas", () => {
    expect(PageEntrySchema.parse(demoCmsStore.entries.get(demoIds.page))).toMatchObject({
      sys: { id: demoIds.page, contentType: { sys: { id: "page" } } },
    });
    expect(TabEntrySchema.parse(demoCmsStore.entries.get(demoIds.tab)).fields.strips).toEqual([
      { sys: { type: "Link", linkType: "Entry", id: demoIds.hero } },
      { sys: { type: "Link", linkType: "Entry", id: demoIds.product } },
    ]);
    expect(HeroEntrySchema.parse(demoCmsStore.entries.get(demoIds.hero)).fields.image).toEqual({
      sys: { type: "Link", linkType: "Asset", id: demoIds.logo },
    });
    expect(ProductEntrySchema.parse(demoCmsStore.entries.get(demoIds.product)).fields.sku).toBe(
      "TSHIRT-1"
    );
  });

  it("gateway routes cms and integration batches to the injected loaders", async () => {
    const gateway = createDemoDataGateway(
      createCmsDataLoader(demoCmsStore),
      createIntegrationDataLoader()
    );
    const missing = cmsEntryAri({ id: "missing-entry" });
    const remaining = [pageEntryAri, logoAssetAri, missing, menuEntryAri, tshirtIntegrationAri];

    const result = await gateway.process(createDataResolutionPull(remaining));

    expect(remaining).toEqual([]);
    expect(result.size).toBe(4);
    expect(result.has(pageEntryAri.format())).toBe(true);
    expect(result.has(logoAssetAri.format())).toBe(true);
    expect(result.has(menuEntryAri.format())).toBe(true);
    expect(result.has(tshirtIntegrationAri.format())).toBe(true);
    expect(result.has(missing.format())).toBe(false);

    const asset = result.get(logoAssetAri.format()) as ContentfulAsset;
    expect(asset.fields.file?.url).toBe("https://cdn.example.com/logo.svg");

    const commercial = result.get(tshirtIntegrationAri.format()) as ProductIntegrationSnapshot;
    expect(commercial).toEqual({
      price: { amount: 1999, currency: "EUR" },
      inStock: true,
    });
  });

  it("cms loader batches entry and asset ids (Contentful-style)", async () => {
    const cms = createCmsDataLoader(demoCmsStore);
    const result = await cms.load([pageEntryAri, heroEntryAri, logoAssetAri, productEntryAri]);

    expect([...result.keys()].sort()).toEqual(
      [
        pageEntryAri.format(),
        heroEntryAri.format(),
        logoAssetAri.format(),
        productEntryAri.format(),
      ].sort()
    );
  });

  it("integration loader batches product skus", async () => {
    const integration = createIntegrationDataLoader();
    const result = await integration.load([tshirtIntegrationAri]);

    expect(result.get(tshirtIntegrationAri.format())).toEqual({
      price: { amount: 1999, currency: "EUR" },
      inStock: true,
    });
  });
});
