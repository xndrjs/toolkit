import { describe, expect, it } from "vitest";

import { assetAri } from "../../generated/page-detail.js";
import { DEMO_LOCALE, demoIds } from "../fixtures/store.js";
import { CDN_SOURCE_ID, createCdnSource } from "./data-adapter.js";

const locale = DEMO_LOCALE;
const loadContext = { executionContext: { locale }, batchNumber: 1 };

describe("createCdnSource", () => {
  it("owns only assetAri", () => {
    const source = createCdnSource();
    expect(source.id).toBe(CDN_SOURCE_ID);
    expect(source.for.map((family) => family.type)).toEqual(["Asset"]);
  });

  it("returns asset fixtures and omits unknown keys", async () => {
    const source = createCdnSource();
    const known = assetAri({ id: demoIds.assetHero, locale });
    const missing = assetAri({ id: "missing-asset", locale });

    const records = await source.load([known, missing], loadContext);

    expect(records).toHaveLength(1);
    expect(records[0]?.resource.toString()).toBe(known.toString());
    expect(records[0]?.payload).toMatchObject({
      id: demoIds.assetHero,
      url: "https://cdn.example.com/hero-welcome.jpg",
      kind: "image",
    });
  });
});
