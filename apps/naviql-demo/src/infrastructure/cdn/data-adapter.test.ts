import { describe, expect, it } from "vitest";

import { assetAri } from "../../generated/page-detail.js";
import { DEMO_ENVIRONMENT, DEMO_LOCALE, DEMO_SPACE, demoIds } from "../fixtures/store.js";
import { ASSET_SOURCE_ID, createAssetSource } from "../cms/asset-data-adapter.js";

const locale = DEMO_LOCALE;
const loadContext = {
  executionContext: {
    spaceId: DEMO_SPACE,
    environmentId: DEMO_ENVIRONMENT,
    locale,
  },
  batchNumber: 1,
};

describe("createAssetSource", () => {
  it("owns only assetAri", () => {
    const source = createAssetSource();
    expect(source.id).toBe(ASSET_SOURCE_ID);
    expect(source.for.map((family) => family.type)).toEqual(["Asset"]);
  });

  it("returns asset fixtures and omits unknown keys", async () => {
    const source = createAssetSource();
    const known = assetAri({
      spaceId: DEMO_SPACE,
      environmentId: DEMO_ENVIRONMENT,
      id: demoIds.assetHero,
      locale,
    });
    const missing = assetAri({
      spaceId: DEMO_SPACE,
      environmentId: DEMO_ENVIRONMENT,
      id: "missing-asset",
      locale,
    });

    const records = await source.load([known, missing], loadContext);

    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.resource.toString()).toBe(known.toString());
    expect("payload" in record && record.payload).toMatchObject({
      id: demoIds.assetHero,
      url: "https://cdn.example.com/hero-welcome.jpg",
      kind: "image",
    });
  });
});
