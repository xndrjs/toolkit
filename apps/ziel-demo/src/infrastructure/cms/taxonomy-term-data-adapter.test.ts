import { describe, expect, it } from "vitest";

import { taxonomyTermAri } from "../../generated/resources";
import { createDemoPageDetailSources } from "../../composition/demo-sources.js";
import {
  DEMO_ENVIRONMENT,
  DEMO_LOCALE,
  DEMO_SPACE,
  demoIds,
  demoTaxonomyKinds,
} from "../fixtures/cms-store.js";
import { TAXONOMY_TERM_SOURCE_ID, loadCmsTaxonomyTerms } from "./taxonomy-term-data-adapter.js";

const locale = DEMO_LOCALE;
const loadContext = {
  executionContext: {
    spaceId: DEMO_SPACE,
    environmentId: DEMO_ENVIRONMENT,
    locale,
  },
  batchNumber: 1,
};

describe("CmsTaxonomyTerms datasource", () => {
  it("owns only taxonomyTermAri", () => {
    const source = createDemoPageDetailSources().find((s) => s.id === TAXONOMY_TERM_SOURCE_ID)!;
    expect(source.id).toBe(TAXONOMY_TERM_SOURCE_ID);
    expect(source.for.map((family) => family.type)).toEqual(["TaxonomyTerm"]);
  });

  it("loads by composite kind+id and returns undefined for unknown keys", async () => {
    const load = loadCmsTaxonomyTerms();
    const known = taxonomyTermAri({
      spaceId: DEMO_SPACE,
      environmentId: DEMO_ENVIRONMENT,
      kind: demoTaxonomyKinds.category,
      id: demoIds.termCategoryApparel,
      locale,
    });
    const missing = taxonomyTermAri({
      spaceId: DEMO_SPACE,
      environmentId: DEMO_ENVIRONMENT,
      kind: demoTaxonomyKinds.category,
      id: "missing-term",
      locale,
    });
    // Same id under a different kind must not collide.
    const wrongKind = taxonomyTermAri({
      spaceId: DEMO_SPACE,
      environmentId: DEMO_ENVIRONMENT,
      kind: demoTaxonomyKinds.tag,
      id: demoIds.termCategoryApparel,
      locale,
    });

    const payloads = await load([known, missing, wrongKind], loadContext);

    expect(payloads).toEqual([
      {
        kind: demoTaxonomyKinds.category,
        id: demoIds.termCategoryApparel,
        label: "Apparel",
        slug: "apparel",
      },
      undefined,
      undefined,
    ]);
  });
});
