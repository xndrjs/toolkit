import { describe, expect, it } from "vitest";

import { assetAri } from "../../generated";
import { createDemoSources } from "../demo-resolver.js";
import { DEMO_ENVIRONMENT, DEMO_LOCALE, DEMO_SPACE, demoIds } from "../fixtures/store.js";
import { ASSET_SOURCE_ID, loadCmsAssets } from "./asset-data-adapter.js";

const locale = DEMO_LOCALE;
const loadContext = {
  executionContext: {
    spaceId: DEMO_SPACE,
    environmentId: DEMO_ENVIRONMENT,
    locale,
  },
  batchNumber: 1,
};

describe("CmsAssets datasource", () => {
  it("owns only assetAri", () => {
    const source = createDemoSources().find((s) => s.id === ASSET_SOURCE_ID)!;
    expect(source.id).toBe(ASSET_SOURCE_ID);
    expect(source.for.map((family) => family.type)).toEqual(["Asset"]);
  });

  it("returns asset fixtures and undefined for unknown keys (same length)", async () => {
    const load = loadCmsAssets();
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

    const payloads = await load([known, missing], loadContext);

    expect(payloads).toEqual([
      expect.objectContaining({
        id: demoIds.assetHero,
        url: "https://cdn.example.com/hero-welcome.jpg",
        kind: "image",
      }),
      undefined,
    ]);
  });
});
