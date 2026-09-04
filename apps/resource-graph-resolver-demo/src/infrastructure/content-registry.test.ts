import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CMS_ENTRY_BATCH_SIZE,
  createCmsSource,
  demoCmsStore,
  demoIds,
  heroEntryAri,
  loadCmsAssets,
  loadCmsEntries,
  logoAssetAri,
  pageEntryAri,
  productEntryAri,
  type ContentfulAsset,
  type ContentfulResolvedEntry,
} from "./cms/index.js";
import type { DemoContentRegistry } from "./content-registry.js";
import {
  HeroEntrySchema,
  PageEntrySchema,
  ProductEntrySchema,
  TabEntrySchema,
} from "./cms/generated/contentful.schemas.js";
import {
  createIntegrationSource,
  INTEGRATION_BATCH_SIZE,
  loadIntegrationProducts,
  demoProductCatalog,
  tshirtIntegrationAri,
  type ProductIntegrationSnapshot,
} from "./integration/index.js";

describe("source-qualified ARI store", () => {
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
});

describe("demo data sources", () => {
  it("declares the ARI families and backend batch limits each source owns", () => {
    const cms = createCmsSource(demoCmsStore);
    const integration = createIntegrationSource();

    expect(cms.id).toBe("cms");
    expect(cms.for.map((family) => family.type).sort()).toEqual(["cms.asset", "cms.entry"]);
    expect(cms.batchSize).toBe(CMS_ENTRY_BATCH_SIZE);

    expect(integration.id).toBe("integration");
    expect(integration.for.map((family) => family.type)).toEqual(["integration.product"]);
    expect(integration.batchSize).toBe(INTEGRATION_BATCH_SIZE);
  });

  it("loads heterogeneous entries and assets in one CMS batch", async () => {
    const cms = createCmsSource(demoCmsStore);

    const records = await cms.load([pageEntryAri, heroEntryAri, productEntryAri, logoAssetAri], {
      executionContext: { locale: "en-US" },
      batchNumber: 1,
    });

    expect(records.map((record) => record.resource.toString()).sort()).toEqual(
      [
        pageEntryAri.toString(),
        heroEntryAri.toString(),
        logoAssetAri.toString(),
        productEntryAri.toString(),
      ].sort()
    );
  });

  it("omits resources the CMS store does not hold, so the resolver reports them missing", async () => {
    const missing = pageEntryAri;
    const emptyStore = { entries: new Map(), assets: new Map() };
    const cms = createCmsSource(emptyStore);

    const records = await cms.load([missing], {
      executionContext: { locale: "en-US" },
      batchNumber: 1,
    });

    expect(records).toEqual([]);
  });

  it("resolves product snapshots by sku", async () => {
    const records = await loadIntegrationProducts(demoProductCatalog, [tshirtIntegrationAri]);

    expect(records).toHaveLength(1);
    expect(records[0]?.payload).toEqual({
      price: { amount: 1999, currency: "EUR" },
      inStock: true,
    });
  });

  it("skips IO entirely for an empty batch", async () => {
    expect(await loadCmsEntries(demoCmsStore, [])).toEqual([]);
    expect(await loadCmsAssets(demoCmsStore, [])).toEqual([]);
    expect(await loadIntegrationProducts(demoProductCatalog, [])).toEqual([]);
  });
});
