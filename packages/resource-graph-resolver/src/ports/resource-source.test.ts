import { ari, s } from "@xndrjs/application-resources";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  defineResourceSourceFor,
  type PendingResourceBatch,
  type ResourceOfFamily,
} from "./resource-source";

const cmsEntryAri = ari("cms.entry", s.object({ id: s.string(), locale: s.string() }));
const cmsAssetAri = ari("cms.asset", s.object({ id: s.string(), locale: s.string() }));

type CmsEntryResource = ReturnType<typeof cmsEntryAri>;
type CmsAssetResource = ReturnType<typeof cmsAssetAri>;

type CmsRegistry = {
  "cms.entry": { title: string };
  "cms.asset": { url: string };
};

const defineCmsSource = defineResourceSourceFor<CmsRegistry>();

const families = { entry: cmsEntryAri, asset: cmsAssetAri };

describe("resource family typing", () => {
  it("recovers the narrowed ARI type behind a family", () => {
    expectTypeOf<ResourceOfFamily<typeof cmsEntryAri>>().toEqualTypeOf<CmsEntryResource>();
    expectTypeOf<ResourceOfFamily<typeof cmsAssetAri>>().toEqualTypeOf<CmsAssetResource>();
  });

  it("narrows each family slot of a pending batch", () => {
    expectTypeOf<PendingResourceBatch<typeof families>>().toEqualTypeOf<{
      readonly entry: readonly CmsEntryResource[];
      readonly asset: readonly CmsAssetResource[];
    }>();
  });
});

describe("defineResourceSourceFor", () => {
  it("narrows the batch per family and the payload per ARI type inside load", async () => {
    const source = defineCmsSource({
      id: "cms",
      families,
      batchSize: { entry: 2, asset: 5 },
      async load({ entry, asset }, context) {
        expectTypeOf(entry).toEqualTypeOf<readonly CmsEntryResource[]>();
        expectTypeOf(asset).toEqualTypeOf<readonly CmsAssetResource[]>();
        expectTypeOf(context.batchNumber).toEqualTypeOf<number>();

        return [
          ...entry.map((resource) => ({
            resource,
            payload: { title: `entry:${resource.key[0].id}` },
          })),
          ...asset.map((resource) => ({
            resource,
            payload: { url: `https://cdn.example.com/${resource.key[0].id}` },
          })),
        ];
      },
    });

    const pageEntry = cmsEntryAri({ id: "page", locale: "en-US" });
    const logoAsset = cmsAssetAri({ id: "logo", locale: "en-US" });

    const records = await source.load(
      { entry: [pageEntry], asset: [logoAsset] },
      { executionContext: undefined, batchNumber: 1 }
    );

    expect(records.map((record) => [record.resource.toString(), record.payload])).toEqual([
      [pageEntry.toString(), { title: "entry:page" }],
      [logoAsset.toString(), { url: "https://cdn.example.com/logo" }],
    ]);
  });

  it("defaults batchSize to unlimited and concurrency to serial", () => {
    const source = defineCmsSource({
      id: "cms",
      families,
      load: async () => [],
    });

    expect(source.batchSize).toEqual({});
    expect(source.concurrency).toBe(1);
    expect(Object.keys(source.families)).toEqual(["entry", "asset"]);
  });

  it("clamps a non-positive or fractional concurrency to a usable integer", () => {
    const serial = defineCmsSource({ id: "a", families, concurrency: 0, load: async () => [] });
    const parallel = defineCmsSource({ id: "b", families, concurrency: 3.7, load: async () => [] });

    expect(serial.concurrency).toBe(1);
    expect(parallel.concurrency).toBe(3);
  });
});
