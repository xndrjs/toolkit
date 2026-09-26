import { describe, expect, it } from "vitest";

import { assetAri, entryAri, pageAri } from "../../generated";
import {
  DEMO_ENVIRONMENT,
  DEMO_LOCALE,
  DEMO_SPACE,
  demoEntries,
  demoIds,
  entryLookupKey,
} from "../fixtures/store.js";
import { ENTRY_SOURCE_ID, createEntrySource } from "./entries-data-adapter.js";

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

  it("returns positional Entry payload without rematerialize", async () => {
    const source = createEntrySource();
    const entry = entryAri(entryIdentity(demoIds.heroWelcome));

    const payloads = await source.load([entry], loadContext);
    expect(payloads).toEqual([
      expect.objectContaining({
        type: "Hero",
        id: demoIds.heroWelcome,
      }),
    ]);
  });

  it("serves root Page and polymorphic Entry documents from the same store", async () => {
    const source = createEntrySource();
    const page = pageAri(entryIdentity(demoIds.page));
    const menu = entryAri(entryIdentity(demoIds.menu));
    const about = entryAri(entryIdentity(demoIds.pageAbout));

    const payloads = await source.load([page, menu, about], loadContext);
    expect(payloads).toHaveLength(3);
    expect(payloads[0]).toMatchObject({
      id: demoIds.page,
      title: "Homepage",
    });
    expect(payloads[1]).toMatchObject({ type: "Menu", id: demoIds.menu });
    expect(payloads[2]).toEqual({
      type: "Page",
      id: demoIds.pageAbout,
      title: "About",
    });
  });

  it("returns undefined for Entry/Page kind mismatches (same length as batch)", async () => {
    const source = createEntrySource();
    const pageAsEntry = entryAri(entryIdentity(demoIds.page));
    const aboutAsPage = pageAri(entryIdentity(demoIds.pageAbout));

    expect(await source.load([pageAsEntry], loadContext)).toEqual([undefined]);
    expect(await source.load([aboutAsPage], loadContext)).toEqual([undefined]);
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

  it("does not own Asset ARIs (routed elsewhere — empty batch from this source)", async () => {
    const source = createEntrySource();
    const asset = assetAri({
      spaceId,
      environmentId,
      id: demoIds.assetLogo,
      locale,
    });
    // Asset is not in `for`; if somehow asked, map yields undefined slots.
    expect(await source.load([asset], loadContext)).toEqual([undefined]);
  });
});
