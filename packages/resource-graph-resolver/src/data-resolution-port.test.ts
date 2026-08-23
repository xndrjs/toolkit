import { describe, expect, it } from "vitest";

import { createDataResolutionPull, type DataResolutionPort } from "./data-resolution-port";
import { testAri } from "./test-fixtures.js";

describe("DataResolutionPort", () => {
  it("process pulls matching resources and returns a map keyed by resource.toString()", async () => {
    const page = testAri("page", "P");
    const asset = testAri("asset", "A");
    const missing = testAri("menu", "M");

    const port: DataResolutionPort = {
      async process(pull) {
        const values = new Map<string, unknown>();
        for (const resource of pull.take(() => true)) {
          if (resource.equals(missing)) {
            continue;
          }
          values.set(resource.toString(), { type: resource.type });
        }
        return values;
      },
    };

    const remaining = [page, asset, missing];
    const result = await port.process(createDataResolutionPull(remaining));

    expect(remaining).toEqual([]);
    expect(result.size).toBe(2);
    expect(result.get(page.toString())).toEqual({ type: "page" });
    expect(result.get(asset.toString())).toEqual({ type: "asset" });
    expect(result.has(missing.toString())).toBe(false);
  });

  it("take leaves non-accepted resources for a later call", async () => {
    const page = testAri("page", "P");
    const asset = testAri("asset", "A");
    const remaining = [page, asset];
    const pull = createDataResolutionPull(remaining);

    expect(pull.take((resource) => resource.type === "page")).toEqual([page]);
    expect(remaining).toEqual([asset]);

    expect(pull.take((resource) => resource.type === "asset")).toEqual([asset]);
    expect(remaining).toEqual([]);
  });

  it("take respects an optional limit", () => {
    const a = testAri("item", "1");
    const b = testAri("item", "2");
    const c = testAri("item", "3");
    const remaining = [a, b, c];
    const pull = createDataResolutionPull(remaining);

    expect(pull.take(() => true, 2)).toEqual([a, b]);
    expect(remaining).toEqual([c]);
    expect(pull.take(() => true, 0)).toEqual([]);
    expect(remaining).toEqual([c]);
  });
});
