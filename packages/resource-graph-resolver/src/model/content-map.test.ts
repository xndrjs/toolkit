import { describe, expect, expectTypeOf, it } from "vitest";

import { ContentMap } from "./content-map";
import { testAri } from "../testing/test-fixtures.js";

type DemoRegistry = {
  asset: { url: string };
  page: { title: string };
};

describe("ContentMap", () => {
  it("stores a single value per resource.toString() key", () => {
    const map = new ContentMap();
    const asset = testAri("asset", "A");
    const sameAsset = testAri("asset", "A");

    map.set(asset, { url: "https://cdn.example.com/logo.svg" });
    map.set(sameAsset, { url: "https://cdn.example.com/logo-v2.svg" });

    expect(map.has(asset)).toBe(true);
    expect(map.hasKey(asset.toString())).toBe(true);
    expect(map.get(asset)).toEqual({ url: "https://cdn.example.com/logo-v2.svg" });
    expect(map.getByKey(asset.toString())).toEqual({
      url: "https://cdn.example.com/logo-v2.svg",
    });
  });

  it("returns undefined for missing resources", () => {
    const map = new ContentMap();
    const missing = testAri("page", "P");

    expect(map.has(missing)).toBe(false);
    expect(map.hasKey(missing.toString())).toBe(false);
    expect(map.get(missing)).toBeUndefined();
    expect(map.getByKey(missing.toString())).toBeUndefined();
  });

  it("types get/set from a ContentRegistry and ari.type", () => {
    const map = new ContentMap<DemoRegistry>();
    const asset = testAri("asset", "A");
    const page = testAri("page", "P");

    map.set(asset, { url: "https://cdn.example.com/logo.svg" });
    map.set(page, { title: "Homepage" });

    const assetValue = map.get(asset);
    const pageValue = map.get(page);

    expectTypeOf(assetValue).toEqualTypeOf<{ url: string } | undefined>();
    expectTypeOf(pageValue).toEqualTypeOf<{ title: string } | undefined>();
    expect(assetValue).toEqual({ url: "https://cdn.example.com/logo.svg" });
    expect(pageValue).toEqual({ title: "Homepage" });
  });
});
