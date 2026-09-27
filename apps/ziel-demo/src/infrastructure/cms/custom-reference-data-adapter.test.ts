import { describe, expect, it } from "vitest";

import { customReferenceAri } from "../../generated";
import {
  DEMO_ENVIRONMENT,
  DEMO_LOCALE,
  DEMO_SPACE,
  demoHeroWelcomeCustomRef,
  demoIds,
  demoLogoAssetCustomRef,
} from "../fixtures/store.js";
import { loadCmsCustomReferences } from "./custom-reference-data-adapter.js";

const locale = DEMO_LOCALE;
const spaceId = DEMO_SPACE;
const environmentId = DEMO_ENVIRONMENT;
const loadContext = {
  executionContext: { spaceId, environmentId, locale },
  batchNumber: 1,
};

describe("CmsCustomReferences datasource", () => {
  it("decodes CustomReference ENTRY into a locator payload slot", async () => {
    const customRef = customReferenceAri({ ref: demoHeroWelcomeCustomRef, locale });

    expect(await loadCmsCustomReferences([customRef], loadContext)).toEqual([
      {
        type: "Entry",
        spaceId,
        environmentId,
        id: demoIds.heroWelcome,
      },
    ]);
  });

  it("decodes CustomReference ASSET into a locator payload slot", async () => {
    const customRef = customReferenceAri({ ref: demoLogoAssetCustomRef, locale });

    expect(await loadCmsCustomReferences([customRef], loadContext)).toEqual([
      {
        type: "Asset",
        spaceId,
        environmentId,
        id: demoIds.assetLogo,
      },
    ]);
  });
});
