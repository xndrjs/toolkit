import { createDataResolutionPull, type DataResolutionPort } from "./data-resolution-port";
import { testAri } from "./test-fixtures.js";
import type { ResolvedResourceRecord } from "./types";
import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import { describe, expect, expectTypeOf, it } from "vitest";

describe("DataResolutionPort", () => {
  it("process pulls matching resources and returns correlated records", async () => {
    const page = testAri("page", "P");
    const asset = testAri("asset", "A");
    const missing = testAri("menu", "M");

    const port: DataResolutionPort = {
      async process(pull) {
        const records: ResolvedResourceRecord<Record<string, unknown>>[] = [];
        for (const resource of pull.take(() => true)) {
          if (resource.equals(missing)) {
            continue;
          }
          records.push({ resource, payload: { type: resource.type } });
        }
        return records;
      },
    };

    const remaining = [page, asset, missing];
    const result = await port.process(createDataResolutionPull(remaining));

    expect(remaining).toEqual([]);
    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        { resource: page, payload: { type: "page" } },
        { resource: asset, payload: { type: "asset" } },
      ])
    );
  });

  it("types correlated records in port results", () => {
    type TestRegistry = { page: { title: string }; asset: { url: string } };
    type PageRecord = Extract<
      ResolvedResourceRecord<TestRegistry>,
      { resource: ApplicationResourceIdentifier<"page"> }
    >;

    expectTypeOf<PageRecord["payload"]>().toEqualTypeOf<{ title: string }>();
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

  it("createDataResolutionPull exposes an optional abort signal", () => {
    const controller = new AbortController();
    const pull = createDataResolutionPull([], { signal: controller.signal });
    expect(pull.signal).toBe(controller.signal);
  });
});
