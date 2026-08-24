import { describe, expect, expectTypeOf, it, vi } from "vitest";
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

  it("routes ARIs via source ownership accepts predicates", () => {
    const cms = createCmsDataLoader(demoCmsStore);
    const integration = createIntegrationDataLoader();

    expect(cms.accepts(pageEntryAri)).toBe(true);
    expect(cms.accepts(logoAssetAri)).toBe(true);
    expect(cms.accepts(tshirtIntegrationAri)).toBe(false);

    expect(integration.accepts(tshirtIntegrationAri)).toBe(true);
    expect(integration.accepts(pageEntryAri)).toBe(false);
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
      { sys: { type: "Link", linkType: "Entry", id: demoIds.tabsSecondary } },
      { sys: { type: "Link", linkType: "Entry", id: demoIds.product } },
      { sys: { type: "Link", linkType: "Entry", id: demoIds.productHoodie } },
      { sys: { type: "Link", linkType: "Entry", id: demoIds.productMug } },
    ]);
    expect(JSON.stringify(page)).not.toContain("$ref");
  });

  it("keeps delivery-shaped entries parseable by generated schemas", () => {
    expect(PageEntrySchema.parse(demoCmsStore.entries.get(demoIds.page))).toMatchObject({
      sys: { id: demoIds.page, contentType: { sys: { id: "page" } } },
    });
    expect(TabEntrySchema.parse(demoCmsStore.entries.get(demoIds.tab)).fields.strips).toEqual([
      { sys: { type: "Link", linkType: "Entry", id: demoIds.hero } },
      { sys: { type: "Link", linkType: "Entry", id: demoIds.heroPromo } },
      { sys: { type: "Link", linkType: "Entry", id: demoIds.product } },
      { sys: { type: "Link", linkType: "Entry", id: demoIds.productHoodie } },
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
    const missing = cmsEntryAri({ id: "missing-entry", locale: "en-US" });
    const remaining = [pageEntryAri, logoAssetAri, missing, menuEntryAri, tshirtIntegrationAri];

    const result = await gateway.process(createDataResolutionPull(remaining));

    expect(remaining).toEqual([]);
    expect(result).toHaveLength(4);
    expect(result.some((record) => record.resource.equals(pageEntryAri))).toBe(true);
    expect(result.some((record) => record.resource.equals(logoAssetAri))).toBe(true);
    expect(result.some((record) => record.resource.equals(menuEntryAri))).toBe(true);
    expect(result.some((record) => record.resource.equals(tshirtIntegrationAri))).toBe(true);
    expect(result.some((record) => record.resource.equals(missing))).toBe(false);

    const asset = result.find((record) => record.resource.equals(logoAssetAri))?.payload;
    expect((asset as ContentfulAsset).fields.file?.url).toBe("https://cdn.example.com/logo.svg");

    const commercial = result.find((record) =>
      record.resource.equals(tshirtIntegrationAri)
    )?.payload;
    expect(commercial).toEqual({
      price: { amount: 1999, currency: "EUR" },
      inStock: true,
    });
  });

  it("cms loader fetches entries and assets via separate batch APIs (Contentful-style)", async () => {
    const cms = createCmsDataLoader(demoCmsStore);
    const [entries, assets] = await Promise.all([
      cms.loadEntries([pageEntryAri, heroEntryAri, productEntryAri]),
      cms.loadAssets([logoAssetAri]),
    ]);

    expect([...entries, ...assets].map((record) => record.resource.toString()).sort()).toEqual(
      [
        pageEntryAri.toString(),
        heroEntryAri.toString(),
        logoAssetAri.toString(),
        productEntryAri.toString(),
      ].sort()
    );
  });

  it("integration loader batches product skus", async () => {
    const integration = createIntegrationDataLoader();
    const result = await integration.load([tshirtIntegrationAri]);

    expect(result.find((record) => record.resource.equals(tshirtIntegrationAri))?.payload).toEqual({
      price: { amount: 1999, currency: "EUR" },
      inStock: true,
    });
  });

  it("cms loader skips IO when both entry and asset takes are empty", async () => {
    const cms = createCmsDataLoader(demoCmsStore);
    const loadEntries = vi.spyOn(cms, "loadEntries");
    const loadAssets = vi.spyOn(cms, "loadAssets");

    const result = await cms.process(createDataResolutionPull([tshirtIntegrationAri]));

    expect(result).toEqual([]);
    expect(loadEntries).not.toHaveBeenCalled();
    expect(loadAssets).not.toHaveBeenCalled();
  });

  it("cms loader skips only the empty batch side when the other take has work", async () => {
    const cms = createCmsDataLoader(demoCmsStore);
    const loadEntries = vi.spyOn(cms, "loadEntries");
    const loadAssets = vi.spyOn(cms, "loadAssets");

    const result = await cms.process(createDataResolutionPull([logoAssetAri]));

    expect(result).toHaveLength(1);
    expect(loadEntries).not.toHaveBeenCalled();
    expect(loadAssets).toHaveBeenCalledTimes(1);
  });

  it("integration loader skips IO when take returns an empty batch", async () => {
    const integration = createIntegrationDataLoader();
    const load = vi.spyOn(integration, "load");

    const result = await integration.process(createDataResolutionPull([pageEntryAri]));

    expect(result).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });
});
