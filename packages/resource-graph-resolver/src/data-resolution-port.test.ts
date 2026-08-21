import { ari } from "@xndrjs/application-resources";
import { describe, expect, it } from "vitest";

import type { DataResolutionPort } from "./data-resolution-port";

describe("DataResolutionPort", () => {
  it("accepts a batch and returns a map keyed by resource.format()", async () => {
    const page = ari("page", { id: "P" });
    const asset = ari("asset", { id: "A" });
    const missing = ari("menu", { id: "M" });

    const port: DataResolutionPort = {
      async resolve(resources) {
        const values = new Map<string, unknown>();
        for (const resource of resources) {
          if (resource.equals(missing)) {
            continue;
          }
          values.set(resource.format(), { type: resource.type });
        }
        return values;
      },
    };

    const result = await port.resolve([page, asset, missing]);

    expect(result.size).toBe(2);
    expect(result.get(page.format())).toEqual({ type: "page" });
    expect(result.get(asset.format())).toEqual({ type: "asset" });
    expect(result.has(missing.format())).toBe(false);
  });
});
