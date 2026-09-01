import { describe, expect, it } from "vitest";

import * as api from "./index.js";

const EXPECTED_RUNTIME_EXPORTS = [
  "ContentMap",
  "IslandDependencyMap",
  "IslandMap",
  "MissingResourceError",
  "NoDataSourceError",
  "ResourceGraphAbortedError",
  "ResourceGraphError",
  "ResourceLoadFailedError",
  "buildBackingResourcesFromIslands",
  "createGraphResolutionStrategy",
  "createResourceGraphResolver",
  "defineDataSourceFor",
  "serializeAllIslands",
  "serializeIsland",
] as const;

const REMOVED_RUNTIME_EXPORTS = [
  "createExpansionPolicyChain",
  "defineExpansionPolicy",
  "createIslandPolicyChain",
  "defineIslandPolicy",
  "createStrategy",
] as const;

describe("public API", () => {
  it("exports the documented runtime symbols", () => {
    expect(Object.keys(api).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
  });

  it("does not export removed low-level policy helpers", () => {
    for (const symbol of REMOVED_RUNTIME_EXPORTS) {
      expect(api).not.toHaveProperty(symbol);
    }
  });
});
