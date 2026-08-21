import { describe, expect, expectTypeOf, it } from "vitest";

import { entryAri } from "./ari.js";
import type { DemoContentRegistry } from "./content-registry.js";
import {
  demoIds,
  demoStore,
  heroEntryAri,
  logoAssetAri,
  menuEntryAri,
  pageEntryAri,
  productEntryAri,
  tabEntryAri,
} from "./demo-content-fixtures.js";
import {
  HeroEntrySchema,
  PageEntrySchema,
  ProductEntrySchema,
  TabEntrySchema,
} from "./generated/contentful.schemas.js";
import { createInMemoryDataPort } from "./in-memory-data-port.js";
import {
  mockEntryLink,
  type MockContentfulAsset,
  type MockContentfulEntry,
} from "./mock-contentful-types.js";

describe("opaque ARI store", () => {
  it("uses only entry|asset ARI types", () => {
    expect(pageEntryAri.type).toBe("entry");
    expect(logoAssetAri.type).toBe("asset");
    expectTypeOf(pageEntryAri.type).toEqualTypeOf<"entry">();
    expectTypeOf(logoAssetAri.type).toEqualTypeOf<"asset">();
  });

  it("types ContentRegistry with mock CMS envelopes (fields stay opaque)", () => {
    expectTypeOf<DemoContentRegistry["entry"]>().toEqualTypeOf<MockContentfulEntry>();
    expectTypeOf<DemoContentRegistry["asset"]>().toEqualTypeOf<MockContentfulAsset>();
  });

  it("stores CMS Link stubs instead of $ref ARI strings", () => {
    const page = demoStore.get(pageEntryAri.format()) as MockContentfulEntry;

    expect(page.fields.menu).toEqual(mockEntryLink(demoIds.menu));
    expect(page.fields.modules).toEqual([
      mockEntryLink(demoIds.tabs),
      mockEntryLink(demoIds.product),
    ]);
    expect(JSON.stringify(page)).not.toContain("$ref");
  });

  it("keeps delivery-shaped entries parseable by generated schemas", () => {
    expect(PageEntrySchema.parse(demoStore.get(pageEntryAri.format()))).toMatchObject({
      sys: { id: demoIds.page, contentType: { sys: { id: "page" } } },
    });
    expect(TabEntrySchema.parse(demoStore.get(tabEntryAri.format())).fields.strips).toEqual([
      mockEntryLink(demoIds.hero),
      mockEntryLink(demoIds.product),
    ]);
    expect(HeroEntrySchema.parse(demoStore.get(heroEntryAri.format())).fields.image).toEqual({
      sys: { type: "Link", linkType: "Asset", id: demoIds.logo },
    });
    expect(ProductEntrySchema.parse(demoStore.get(productEntryAri.format())).fields.sku).toBe(
      "WIDGET-1"
    );
  });

  it("resolves batches by format() and omits missing keys", async () => {
    const port = createInMemoryDataPort(demoStore);
    const missing = entryAri("missing-entry");

    const result = await port.resolve([pageEntryAri, logoAssetAri, missing, menuEntryAri]);

    expect(result.size).toBe(3);
    expect(result.has(pageEntryAri.format())).toBe(true);
    expect(result.has(logoAssetAri.format())).toBe(true);
    expect(result.has(menuEntryAri.format())).toBe(true);
    expect(result.has(missing.format())).toBe(false);

    const asset = result.get(logoAssetAri.format()) as MockContentfulAsset;
    expect(asset.fields.file.url).toBe("https://cdn.example.com/logo.svg");
  });
});
