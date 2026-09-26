import { describe, expect, it } from "vitest";

import {
  assetAri,
  customReferenceAri,
  entryAri,
  footerAri,
  heroAri,
  menuAri,
  pageAri,
  productAri,
  tabAri,
  tabsAri,
} from "../../generated/page-detail.js";
import {
  DEMO_ENVIRONMENT,
  DEMO_LOCALE,
  DEMO_SPACE,
  demoEntries,
  demoHeroWelcomeCustomRef,
  demoIds,
  demoLogoAssetCustomRef,
  entryLookupKey,
} from "../fixtures/store.js";
import { createCustomReferenceSource } from "./custom-reference-data-adapter.js";
import { ENTRY_SOURCE_ID, createEntrySource } from "./data-adapter.js";

const locale = DEMO_LOCALE;
const spaceId = DEMO_SPACE;
const environmentId = DEMO_ENVIRONMENT;
const loadContext = {
  executionContext: { spaceId, environmentId, locale },
  batchNumber: 1,
};

const entryIdentity = (id: string) => ({ spaceId, environmentId, id, locale });

describe("createEntrySource", () => {
  it("owns editorial entry ARI families (not CustomReference / Asset)", () => {
    const source = createEntrySource();
    expect(source.id).toBe(ENTRY_SOURCE_ID);
    expect(source.for.map((family) => family.type).sort()).toEqual([
      "Entry",
      "Footer",
      "Hero",
      "Menu",
      "Page",
      "Product",
      "Tab",
      "Tabs",
    ]);
  });

  it("looks up by entry id for both Entry and concrete Hero ARIs", async () => {
    const source = createEntrySource();
    const entry = entryAri(entryIdentity(demoIds.heroWelcome));
    const hero = heroAri(entryIdentity(demoIds.heroWelcome));

    const fromEntry = await source.load([entry], loadContext);
    const fromHero = await source.load([hero], loadContext);

    expect(fromEntry).toHaveLength(1);
    expect(fromEntry[0]!.resource.toString()).toBe(hero.toString());
    expect(fromEntry[0]!.resolves?.map((r) => r.toString())).toEqual([entry.toString()]);

    expect(fromHero).toHaveLength(1);
    expect(fromHero[0]!.resource.toString()).toBe(hero.toString());
    expect(fromHero[0]!.resolves).toBeUndefined();
  });

  it("serves Page / Menu / Footer / Tab from the entries fixture", async () => {
    const source = createEntrySource();
    const page = pageAri(entryIdentity(demoIds.page));
    const menu = menuAri(entryIdentity(demoIds.menu));
    const footer = footerAri(entryIdentity(demoIds.footer));
    const tab = tabAri(entryIdentity(demoIds.tabOverview));

    const records = await source.load([page, menu, footer, tab], loadContext);
    expect(records.map((r) => r.resource.toString()).sort()).toEqual(
      [page.toString(), menu.toString(), footer.toString(), tab.toString()].sort()
    );
  });

  it("rematerializes Entry into Tabs / Product", async () => {
    const source = createEntrySource();
    const tabsEntry = entryAri(entryIdentity(demoIds.tabs));
    const productEntry = entryAri(entryIdentity(demoIds.productTshirt));

    const tabs = await source.load([tabsEntry], loadContext);
    expect(tabs[0]!.resource.toString()).toBe(tabsAri(entryIdentity(demoIds.tabs)).toString());

    const product = await source.load([productEntry], loadContext);
    expect(product[0]!.resource.toString()).toBe(
      productAri(entryIdentity(demoIds.productTshirt)).toString()
    );
  });

  it("Page.strips links carry only EntryId — no content-type discriminant", () => {
    const doc = demoEntries.get(entryLookupKey({ spaceId, environmentId, id: demoIds.page }));
    expect(doc?.contentTypeId).toBe("page");
    if (doc?.contentTypeId !== "page") {
      return;
    }
    for (const link of doc.payload.strips) {
      expect(Object.keys(link).sort()).toEqual(["id"]);
      expect(link).not.toHaveProperty("type");
    }
  });

  it("does not own Asset ARIs", async () => {
    const source = createEntrySource();
    const asset = assetAri({
      spaceId,
      environmentId,
      id: demoIds.assetLogo,
      locale,
    });
    expect(await source.load([asset], loadContext)).toEqual([]);
  });
});

describe("createCustomReferenceSource", () => {
  it("redirects CustomReference ENTRY to Entry without fetching payloads", async () => {
    const source = createCustomReferenceSource();
    const customRef = customReferenceAri({ ref: demoHeroWelcomeCustomRef, locale });
    const entry = entryAri(entryIdentity(demoIds.heroWelcome));

    const records = await source.load([customRef], loadContext);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      redirect: true,
      resource: expect.objectContaining({ type: "Entry" }),
      resolves: [customRef],
    });
    expect(records[0]!.resource.toString()).toBe(entry.toString());
    expect(records[0]).not.toHaveProperty("payload");
  });

  it("redirects CustomReference ASSET to Asset without fetching payloads", async () => {
    const source = createCustomReferenceSource();
    const customRef = customReferenceAri({ ref: demoLogoAssetCustomRef, locale });
    const asset = assetAri({
      spaceId,
      environmentId,
      id: demoIds.assetLogo,
      locale,
    });

    const records = await source.load([customRef], loadContext);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      redirect: true,
      resource: expect.objectContaining({ type: "Asset" }),
      resolves: [customRef],
    });
    expect(records[0]!.resource.toString()).toBe(asset.toString());
    expect(records[0]).not.toHaveProperty("payload");
  });
});
