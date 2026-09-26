import { describe, expect, it } from "vitest";

import { assetAri, customReferenceAri, entryAri, pageAri } from "../../generated/page-detail.js";
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
  it("owns Page + Entry ARI families (not CustomReference / Asset)", () => {
    const source = createEntrySource();
    expect(source.id).toBe(ENTRY_SOURCE_ID);
    expect(source.for.map((family) => family.type).sort()).toEqual(["Entry", "Page"]);
  });

  it("returns Entry ARI + payload without rematerialize", async () => {
    const source = createEntrySource();
    const entry = entryAri(entryIdentity(demoIds.heroWelcome));

    const records = await source.load([entry], loadContext);
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.resource.toString()).toBe(entry.toString());
    expect("resolves" in record ? record.resolves : undefined).toBeUndefined();
    expect("payload" in record ? record.payload : undefined).toMatchObject({
      type: "Hero",
      id: demoIds.heroWelcome,
    });
  });

  it("serves root Page and polymorphic Entry documents from the same store", async () => {
    const source = createEntrySource();
    const page = pageAri(entryIdentity(demoIds.page));
    const menu = entryAri(entryIdentity(demoIds.menu));
    const about = entryAri(entryIdentity(demoIds.pageAbout));

    const records = await source.load([page, menu, about], loadContext);
    expect(records.map((r) => r.resource.toString()).sort()).toEqual(
      [page.toString(), menu.toString(), about.toString()].sort()
    );

    const pageRecord = records.find((r) => pageAri.matches(r.resource));
    expect(pageRecord && "payload" in pageRecord ? pageRecord.payload : undefined).toMatchObject({
      id: demoIds.page,
      title: "Homepage",
    });

    const aboutRecord = records.find((r) => r.resource.equals(about));
    expect(aboutRecord && "payload" in aboutRecord ? aboutRecord.payload : undefined).toEqual({
      type: "Page",
      id: demoIds.pageAbout,
      title: "About",
    });
  });

  it("does not serve Entry payloads for Page ARI requests (or vice versa)", async () => {
    const source = createEntrySource();
    const pageAsEntry = entryAri(entryIdentity(demoIds.page));
    const aboutAsPage = pageAri(entryIdentity(demoIds.pageAbout));

    expect(await source.load([pageAsEntry], loadContext)).toEqual([]);
    expect(await source.load([aboutAsPage], loadContext)).toEqual([]);
  });

  it("Page.strips links carry only EntryId — no content-type discriminant", () => {
    const doc = demoEntries.get(entryLookupKey({ spaceId, environmentId, id: demoIds.page }));
    expect(doc?.kind).toBe("page");
    if (doc?.kind !== "page") {
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
  it("decodes CustomReference ENTRY into a locator payload (no redirect record)", async () => {
    const source = createCustomReferenceSource();
    const customRef = customReferenceAri({ ref: demoHeroWelcomeCustomRef, locale });

    const records = await source.load([customRef], loadContext);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      resource: customRef,
      payload: {
        type: "Entry",
        spaceId,
        environmentId,
        id: demoIds.heroWelcome,
        locale,
      },
    });
    expect(records[0]).not.toHaveProperty("redirect");
  });

  it("decodes CustomReference ASSET into a locator payload (no redirect record)", async () => {
    const source = createCustomReferenceSource();
    const customRef = customReferenceAri({ ref: demoLogoAssetCustomRef, locale });

    const records = await source.load([customRef], loadContext);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      resource: customRef,
      payload: {
        type: "Asset",
        spaceId,
        environmentId,
        id: demoIds.assetLogo,
        locale,
      },
    });
    expect(records[0]).not.toHaveProperty("redirect");
  });
});
