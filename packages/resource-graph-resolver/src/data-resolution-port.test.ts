import { ari, type ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import { describe, expect, it } from "vitest";

import { createDataResolutionPull, type DataResolutionPort } from "./data-resolution-port";

describe("DataResolutionPort", () => {
  it("process pulls matching resources and returns a map keyed by resource.format()", async () => {
    const page = ari("page", { id: "P" });
    const asset = ari("asset", { id: "A" });
    const missing = ari("menu", { id: "M" });

    const port: DataResolutionPort = {
      async process(pull) {
        const values = new Map<string, unknown>();
        for (const resource of pull.matching(() => true)) {
          if (resource.equals(missing)) {
            continue;
          }
          values.set(resource.format(), { type: resource.type });
        }
        return values;
      },
    };

    const remaining = [page, asset, missing];
    const result = await port.process(createDataResolutionPull(remaining));

    expect(remaining).toEqual([]);
    expect(result.size).toBe(2);
    expect(result.get(page.format())).toEqual({ type: "page" });
    expect(result.get(asset.format())).toEqual({ type: "asset" });
    expect(result.has(missing.format())).toBe(false);
  });

  it("matching leaves non-accepted resources for a later take", async () => {
    const page = ari("page", { id: "P" });
    const asset = ari("asset", { id: "A" });
    const remaining = [page, asset];
    const pull = createDataResolutionPull(remaining);

    const pages = [...pull.matching((resource) => resource.type === "page")];
    expect(pages).toEqual([page]);
    expect(remaining).toEqual([asset]);

    const assets = [...pull.matching((resource) => resource.type === "asset")];
    expect(assets).toEqual([asset]);
    expect(remaining).toEqual([]);
  });
});
