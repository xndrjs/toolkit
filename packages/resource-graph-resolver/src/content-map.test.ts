import { ari } from "@xndrjs/application-resources";
import { describe, expect, expectTypeOf, it } from "vitest";

import { ContentMap } from "./content-map";

type DemoRegistry = {
  asset: { url: string };
  page: { title: string };
};

describe("ContentMap", () => {
  it("stores a single value per resource.format() key", () => {
    const map = new ContentMap();
    const asset = ari("asset", { id: "A" });
    const sameAsset = ari("asset", { id: "A" });

    map.set(asset, { url: "https://cdn.example.com/logo.svg" });
    map.set(sameAsset, { url: "https://cdn.example.com/logo-v2.svg" });

    expect(map.has(asset)).toBe(true);
    expect(map.hasKey(asset.format())).toBe(true);
    expect(map.get(asset)).toEqual({ url: "https://cdn.example.com/logo-v2.svg" });
    expect(map.getByKey(asset.format())).toEqual({
      url: "https://cdn.example.com/logo-v2.svg",
    });
  });

  it("returns undefined for missing resources", () => {
    const map = new ContentMap();
    const missing = ari("page", { id: "P" });

    expect(map.has(missing)).toBe(false);
    expect(map.hasKey(missing.format())).toBe(false);
    expect(map.get(missing)).toBeUndefined();
    expect(map.getByKey(missing.format())).toBeUndefined();
  });

  it("types get/set from a ContentRegistry and ari.type", () => {
    const map = new ContentMap<DemoRegistry>();
    const asset = ari("asset", { id: "A" });
    const page = ari("page", { id: "P" });

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
