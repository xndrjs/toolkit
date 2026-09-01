import { ari, s } from "@xndrjs/application-resources";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  defineDataSourceFor,
  type ResourceOfFamily,
  type ResourceUnionFromFamilies,
} from "./data-source";

const cmsEntryAri = ari("cms.entry", s.object({ id: s.string(), locale: s.string() }));
const cmsAssetAri = ari("cms.asset", s.object({ id: s.string(), locale: s.string() }));

type CmsEntryResource = ReturnType<typeof cmsEntryAri>;
type CmsAssetResource = ReturnType<typeof cmsAssetAri>;

type CmsRegistry = {
  "cms.entry": { title: string };
  "cms.asset": { url: string };
};

const defineCmsSource = defineDataSourceFor<CmsRegistry>();

const forFamilies = [cmsEntryAri, cmsAssetAri] as const;

describe("resource family typing", () => {
  it("recovers the narrowed ARI type behind a family", () => {
    expectTypeOf<ResourceOfFamily<typeof cmsEntryAri>>().toEqualTypeOf<CmsEntryResource>();
    expectTypeOf<ResourceOfFamily<typeof cmsAssetAri>>().toEqualTypeOf<CmsAssetResource>();
  });

  it("unions the ARI types behind a for list", () => {
    expectTypeOf<ResourceUnionFromFamilies<typeof forFamilies>>().toEqualTypeOf<
      CmsEntryResource | CmsAssetResource
    >();
  });
});

describe("defineDataSourceFor", () => {
  it("narrows the batch and the payload per ARI type inside load", async () => {
    const source = defineCmsSource({
      id: "cms",
      for: forFamilies,
      batchSize: 100,
      async load(batch, context) {
        expectTypeOf(batch).toEqualTypeOf<readonly (CmsEntryResource | CmsAssetResource)[]>();
        expectTypeOf(context.batchNumber).toEqualTypeOf<number>();

        return batch.map((resource) => {
          if (cmsEntryAri.matches(resource)) {
            return { resource, payload: { title: `entry:${resource.key[0].id}` } };
          }

          return { resource, payload: { url: `https://cdn.example.com/${resource.key[0].id}` } };
        });
      },
    });

    const pageEntry = cmsEntryAri({ id: "page", locale: "en-US" });
    const logoAsset = cmsAssetAri({ id: "logo", locale: "en-US" });

    const records = await source.load([pageEntry, logoAsset], {
      executionContext: undefined,
      batchNumber: 1,
    });

    expect(records.map((record) => [record.resource.toString(), record.payload])).toEqual([
      [pageEntry.toString(), { title: "entry:page" }],
      [logoAsset.toString(), { url: "https://cdn.example.com/logo" }],
    ]);
  });

  it("defaults batchSize to unlimited and concurrency to serial", () => {
    const source = defineCmsSource({
      id: "cms",
      for: forFamilies,
      load: async () => [],
    });

    expect(source.batchSize).toBeUndefined();
    expect(source.concurrency).toBe(1);
    expect(source.for.map((family) => family.type).sort()).toEqual(["cms.asset", "cms.entry"]);
  });

  it("clamps a non-positive or fractional concurrency to a usable integer", () => {
    const serial = defineCmsSource({
      id: "a",
      for: forFamilies,
      concurrency: 0,
      load: async () => [],
    });
    const parallel = defineCmsSource({
      id: "b",
      for: forFamilies,
      concurrency: 3.7,
      load: async () => [],
    });

    expect(serial.concurrency).toBe(1);
    expect(parallel.concurrency).toBe(3);
  });
});
