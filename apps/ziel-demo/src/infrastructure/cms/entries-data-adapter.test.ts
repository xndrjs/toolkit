import { describe, expect, it } from "vitest";

import { assetAri, entryAri, errorLabAri, pageAri } from "../../generated";
import { createDemoPageDetailSources } from "../demo-resolver.js";
import {
  DEMO_ENVIRONMENT,
  DEMO_LOCALE,
  DEMO_SPACE,
  demoEntries,
  demoIds,
  entryLookupKey,
} from "../fixtures/store.js";
import { ENTRY_SOURCE_ID, loadCmsEntries } from "./entries-data-adapter.js";

const locale = DEMO_LOCALE;
const spaceId = DEMO_SPACE;
const environmentId = DEMO_ENVIRONMENT;
const loadContext = {
  executionContext: { spaceId, environmentId, locale },
  batchNumber: 1,
};

const entryIdentity = (id: string) => ({ spaceId, environmentId, id, locale });

function entrySource() {
  return createDemoPageDetailSources().find((source) => source.id === ENTRY_SOURCE_ID)!;
}

describe("CmsEntries datasource", () => {
  it("owns Page + Entry ARI families (not ErrorLab / CustomReference / Asset)", () => {
    const source = entrySource();
    expect(source.id).toBe(ENTRY_SOURCE_ID);
    expect(source.for.map((family) => family.type).sort()).toEqual(["Entry", "Page"]);
  });

  it("returns positional Entry payload without rematerialize", async () => {
    const load = loadCmsEntries();
    const entry = entryAri(entryIdentity(demoIds.heroWelcome));

    const payloads = await load([entry], loadContext);
    expect(payloads).toEqual([
      expect.objectContaining({
        kind: "Hero",
        id: demoIds.heroWelcome,
      }),
    ]);
  });

  it("serves root Page and polymorphic Entry documents from the same store", async () => {
    const load = loadCmsEntries();
    const page = pageAri(entryIdentity(demoIds.page));
    const menu = entryAri(entryIdentity(demoIds.menu));
    const about = entryAri(entryIdentity(demoIds.pageAbout));

    const payloads = await load([page, menu, about], loadContext);
    expect(payloads).toHaveLength(3);
    expect(payloads[0]).toMatchObject({
      id: demoIds.page,
      title: "Homepage",
    });
    expect(payloads[1]).toMatchObject({ kind: "Menu", id: demoIds.menu });
    expect(payloads[2]).toEqual({
      kind: "Page",
      id: demoIds.pageAbout,
      title: "About",
    });
  });

  it("does not serve ErrorLab (routed to ErrorLabStore)", async () => {
    const load = loadCmsEntries();
    const lab = errorLabAri(entryIdentity(demoIds.ehSoftSingle));
    expect(await load([lab as never], loadContext)).toEqual([undefined]);
  });

  it("returns undefined for Entry/Page kind mismatches (same length as batch)", async () => {
    const load = loadCmsEntries();
    const pageAsEntry = entryAri(entryIdentity(demoIds.page));
    const aboutAsPage = pageAri(entryIdentity(demoIds.pageAbout));

    expect(await load([pageAsEntry], loadContext)).toEqual([undefined]);
    expect(await load([aboutAsPage], loadContext)).toEqual([undefined]);
  });

  it("Page.strips links carry only EntryId — no content-type discriminant", () => {
    const doc = demoEntries.get(entryLookupKey({ spaceId, environmentId, id: demoIds.page }));
    expect(doc?.kind).toBe("page");
    if (doc?.kind !== "page") {
      return;
    }
    for (const link of doc.payload.strips) {
      expect(Object.keys(link).sort()).toEqual(["id"]);
      expect(link).not.toHaveProperty("kind");
    }
  });

  it("does not own Asset ARIs (routed elsewhere — empty batch from this source)", async () => {
    const load = loadCmsEntries();
    const asset = assetAri({
      spaceId,
      environmentId,
      id: demoIds.assetLogo,
      locale,
    });
    // Asset is not in `for`; if somehow asked, map yields undefined slots.
    expect(await load([asset as never], loadContext)).toEqual([undefined]);
  });

  it("rejects corrupt store documents at the loader boundary", async () => {
    const corrupt = new Map(demoEntries);
    corrupt.set(entryLookupKey({ spaceId, environmentId, id: demoIds.heroWelcome }), {
      kind: "entry",
      payload: { broken: true } as never,
    });
    const load = loadCmsEntries(corrupt);
    const entry = entryAri(entryIdentity(demoIds.heroWelcome));
    await expect(load([entry], loadContext)).rejects.toThrow(/Invalid Entry payload/);
  });
});
