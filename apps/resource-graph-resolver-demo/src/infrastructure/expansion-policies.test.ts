import { ContentMap, ResolveContentGraphEngine } from "@xndrjs/resource-graph-resolver";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  cmsAssetAri,
  cmsEntryAri,
  createCmsDataLoader,
  demoCmsStore,
  demoIds,
  footerEntryAri,
  heroEntryAri,
  logoAssetAri,
  menuEntryAri,
  pageEntryAri,
  productEntryAri,
  tabsSecondaryEntryAri,
  tabEntryAri,
  tabsEntryAri,
  type CmsAssetResource,
  type CmsEntryResource,
  type ContentfulResolvedEntry,
} from "./cms/index.js";
import type { DemoContentRegistry } from "./content-registry.js";
import {
  createDefaultDemoExecutionContext,
  type DemoExecutionContext,
} from "./demo-execution-context.js";
import { createDemoDataGateway } from "./demo-data-gateway.js";
import { createDemoExpansionPort } from "./expansion-policies.js";
import {
  createIntegrationDataLoader,
  integrationProductAri,
  tshirtIntegrationAri,
} from "./integration/index.js";

function expandEntry(
  resource: CmsEntryResource,
  entry: ContentfulResolvedEntry,
  executionContext: DemoExecutionContext = createDefaultDemoExecutionContext()
) {
  const contentMap = new ContentMap<DemoContentRegistry>();
  contentMap.set(resource, entry);
  return createDemoExpansionPort().expand({
    resource,
    contentMap,
    inheritedIslandId: resource.toString(),
    executionContext,
  });
}

function createDemoGateway() {
  return createDemoDataGateway(createCmsDataLoader(demoCmsStore), createIntegrationDataLoader());
}

describe("createDemoExpansionPort", () => {
  it("expands page links as locale-scoped cms.entry ARIs (modules + menu + footer)", () => {
    const page = demoCmsStore.entries.get(demoIds.page)!;
    const result = expandEntry(pageEntryAri, page);

    expect(result.isIsland).toBe(false);
    expect(result.resources.map((r) => r.toString())).toEqual([
      tabsEntryAri.toString(),
      tabsSecondaryEntryAri.toString(),
      productEntryAri.toString(),
      cmsEntryAri({ id: demoIds.productHoodie, locale: "en-US" }).toString(),
      cmsEntryAri({ id: demoIds.productMug, locale: "en-US" }).toString(),
      menuEntryAri.toString(),
      footerEntryAri.toString(),
    ]);
    expect(result.resources.every((r) => r.type === "cms.entry")).toBe(true);
    expect(
      result.resources.every((resource) => {
        if (resource.type !== "cms.entry") {
          return true;
        }
        return (resource as CmsEntryResource).key[0].locale === "en-US";
      })
    ).toBe(true);
  });

  it("expands polymorphic tab.strips without knowing target content-types", () => {
    const tab = demoCmsStore.entries.get(demoIds.tab)!;
    const result = expandEntry(tabEntryAri, tab);

    expect(result.resources.map((r) => r.toString())).toEqual([
      heroEntryAri.toString(),
      cmsEntryAri({ id: demoIds.heroPromo, locale: "en-US" }).toString(),
      productEntryAri.toString(),
      cmsEntryAri({ id: demoIds.productHoodie, locale: "en-US" }).toString(),
    ]);
    expect(result.resources.every((r) => r.type === "cms.entry")).toBe(true);
  });

  it("marks menu and footer as islands and expands logo assets", () => {
    const menu = demoCmsStore.entries.get(demoIds.menu)!;
    const footer = demoCmsStore.entries.get(demoIds.footer)!;

    const menuResult = expandEntry(menuEntryAri, menu);
    const footerResult = expandEntry(footerEntryAri, footer);

    expect(menuResult.isIsland).toBe(true);
    expect(menuResult.resources.map((r) => r.toString())).toEqual([logoAssetAri.toString()]);
    expect(menuResult.resources[0]?.type).toBe("cms.asset");
    expect((menuResult.resources[0] as CmsAssetResource).key[0].locale).toBe("en-US");

    expect(footerResult.isIsland).toBe(true);
    expect(footerResult.resources.map((r) => r.toString())).toEqual([logoAssetAri.toString()]);
  });

  it("expands hero image to cms.asset and product to integration.product", () => {
    const hero = demoCmsStore.entries.get(demoIds.hero)!;
    const product = demoCmsStore.entries.get(demoIds.product)!;

    expect(expandEntry(heroEntryAri, hero).resources.map((r) => r.toString())).toEqual([
      logoAssetAri.toString(),
    ]);
    expect(expandEntry(productEntryAri, product).resources.map((r) => r.toString())).toEqual([
      tshirtIntegrationAri.toString(),
    ]);
    expect(expandEntry(productEntryAri, product).resources[0]?.type).toBe("integration.product");
  });

  it("when requires executionContext.locale to match the cms.entry ARI locale", () => {
    const product = demoCmsStore.entries.get(demoIds.product)!;
    const contentMap = new ContentMap<DemoContentRegistry>();
    contentMap.set(productEntryAri, product);

    const matched = createDemoExpansionPort().expand({
      resource: productEntryAri,
      contentMap,
      inheritedIslandId: productEntryAri.toString(),
      executionContext: createDefaultDemoExecutionContext("en-US"),
    });
    expect(matched.resources.map((r) => r.toString())).toEqual([tshirtIntegrationAri.toString()]);

    const localeMismatch = createDemoExpansionPort().expand({
      resource: productEntryAri,
      contentMap,
      inheritedIslandId: productEntryAri.toString(),
      executionContext: createDefaultDemoExecutionContext("it-IT"),
    });
    expect(localeMismatch.resources).toEqual([]);

    const italianProduct = cmsEntryAri({ id: demoIds.product, locale: "it-IT" });
    contentMap.set(italianProduct, product);
    const italianMatched = createDemoExpansionPort().expand({
      resource: italianProduct,
      contentMap,
      inheritedIslandId: italianProduct.toString(),
      executionContext: createDefaultDemoExecutionContext("it-IT"),
    });
    expect(italianMatched.resources.map((r) => r.toString())).toEqual([
      integrationProductAri({ sku: "TSHIRT-1", locale: "it-IT" }).toString(),
    ]);

    expectTypeOf(createDefaultDemoExecutionContext().locale).toEqualTypeOf<"en-US" | "it-IT">();
  });

  it("returns no children for assets and integration products", () => {
    const contentMap = new ContentMap<DemoContentRegistry>();
    const asset = demoCmsStore.assets.get(demoIds.logo)!;
    contentMap.set(logoAssetAri, asset);
    contentMap.set(tshirtIntegrationAri, {
      price: { amount: 1999, currency: "EUR" },
      inStock: true,
    });

    const executionContext = createDefaultDemoExecutionContext();

    expect(
      createDemoExpansionPort().expand({
        resource: logoAssetAri,
        contentMap,
        inheritedIslandId: logoAssetAri.toString(),
        executionContext,
      })
    ).toEqual({ resources: [] });

    expect(
      createDemoExpansionPort().expand({
        resource: tshirtIntegrationAri,
        contentMap,
        inheritedIslandId: tshirtIntegrationAri.toString(),
        executionContext,
      })
    ).toEqual({ resources: [] });
  });

  it("resolves the demo page graph with menu/footer islands, shared asset, and integration products", async () => {
    const executionContext = createDefaultDemoExecutionContext();
    const pageRoot = cmsEntryAri({ id: demoIds.page, locale: executionContext.locale });
    const engine = new ResolveContentGraphEngine(createDemoGateway(), createDemoExpansionPort());

    const output = await engine.execute({
      root: pageRoot,
      executionContext,
      missingResourceMode: "throw",
    });

    expect(output.errors).toEqual([]);
    expect(output.contentMap.has(pageRoot)).toBe(true);
    expect(output.contentMap.has(tabsEntryAri)).toBe(true);
    expect(output.contentMap.has(tabsSecondaryEntryAri)).toBe(true);
    expect(output.contentMap.has(tabEntryAri)).toBe(true);
    expect(output.contentMap.has(heroEntryAri)).toBe(true);
    expect(output.contentMap.has(productEntryAri)).toBe(true);
    expect(output.contentMap.has(tshirtIntegrationAri)).toBe(true);
    expect(
      output.contentMap.has(
        integrationProductAri({ sku: demoIds.productSkuHoodie, locale: executionContext.locale })
      )
    ).toBe(true);
    expect(output.contentMap.has(menuEntryAri)).toBe(true);
    expect(output.contentMap.has(footerEntryAri)).toBe(true);
    expect(output.contentMap.has(logoAssetAri)).toBe(true);

    for (const id of demoCmsStore.entries.keys()) {
      expect(output.contentMap.has(cmsEntryAri({ id, locale: executionContext.locale }))).toBe(
        true
      );
    }
    for (const id of demoCmsStore.assets.keys()) {
      expect(output.contentMap.has(cmsAssetAri({ id, locale: executionContext.locale }))).toBe(
        true
      );
    }

    const pageIsland = output.islands.get(pageRoot.toString())!;
    expect(pageIsland.has(pageRoot.toString())).toBe(true);
    expect(pageIsland.has(menuEntryAri.toString())).toBe(false);
    expect(pageIsland.has(footerEntryAri.toString())).toBe(false);
    expect(pageIsland.has(tshirtIntegrationAri.toString())).toBe(true);
    expect(pageIsland.has(logoAssetAri.toString())).toBe(true);

    expect(output.islands.get(menuEntryAri.toString())).toEqual(
      new Set([menuEntryAri.toString(), logoAssetAri.toString()])
    );
    expect(output.islands.get(footerEntryAri.toString())).toEqual(
      new Set([footerEntryAri.toString(), logoAssetAri.toString()])
    );

    expect(output.islandDependencies.get(pageRoot.toString())).toEqual(
      new Set([menuEntryAri.toString(), footerEntryAri.toString()])
    );

    expect(output.contentMap.get(logoAssetAri)).toMatchObject({
      sys: { id: demoIds.logo, type: "Asset" },
    });
    expect(output.contentMap.get(tshirtIntegrationAri)).toEqual({
      price: { amount: 1999, currency: "EUR" },
      inStock: true,
    });
  });
});
