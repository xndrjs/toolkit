import { deriveDesiredInventory } from "@xndrjs/struttura";
import { describe, expect, it } from "vitest";

import { DEFINITION_STAMP } from "./architecture/populate-api.generated";
import { population } from "./architecture/population";

describe("struttura-demo navigable population", () => {
  it("derives desired inventory without diagnostics", () => {
    expect(population.definitionStamp).toBe(DEFINITION_STAMP);
    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.inventory.instances).toHaveLength(24);
    expect(result.inventory.artifacts.length).toBeGreaterThan(0);
    // Tree keys: directory roots use ".", file roots use ".", peer root has no "."
    expect(
      result.inventory.artifacts.some(
        (a) => a.constructName === "CorePackage" && a.artifactKey === "."
      )
    ).toBe(true);
    expect(
      result.inventory.artifacts.some((a) => a.constructName === "Shape" && a.artifactKey === ".")
    ).toBe(true);
    expect(
      result.inventory.artifacts.some(
        (a) => a.constructName === "WorkspaceRoot" && a.artifactKey === "."
      )
    ).toBe(false);
  });
});
