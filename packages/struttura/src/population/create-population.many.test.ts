import { describe, expect, it } from "vitest";

import { array, defineStructure } from "../structure/define-structure";
import { createPopulation } from "./create-population";
import { deriveDesiredInventory } from "../inventory/derive-desired-inventory";

describe("population.add — many dependencies", () => {
  function build() {
    const A = defineStructure("ManyDeps");
    const Core = A.construct("Core", {}, ({ name }) =>
      A.in(A.rootDirectory, A.dir(`cores/${name}`, {}))
    );
    const Catalog = A.construct("Catalog", { cores: array(Core) }, ({ cores }) =>
      A.in(
        A.rootDirectory,
        A.file("catalog.ts", () => `export const n = ${String(cores.length)};\n`, {
          mode: "sync",
        })
      )
    );
    return { A, Core, Catalog };
  }

  it("accepts an empty array for array(C) slots", () => {
    const { A, Catalog } = build();
    const population = createPopulation(A);
    const catalog = population.add(Catalog, { name: "all", cores: [] });
    expect(catalog.dependencies.cores).toEqual([]);

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }
    expect(derived.inventory.instances.find((i) => i.id === "all")?.dependencies).toEqual({
      cores: [],
    });
  });

  it("preserves order of many dependency instances", () => {
    const { A, Core, Catalog } = build();
    const population = createPopulation(A);
    const a = population.add(Core, { name: "a" });
    const b = population.add(Core, { name: "b" });
    const c = population.add(Core, { name: "c" });
    const catalog = population.add(Catalog, { name: "all", cores: [c, a, b] });
    const cores = catalog.dependencies.cores;
    expect(Array.isArray(cores)).toBe(true);
    expect((cores as readonly { id: string }[]).map((core) => core.id)).toEqual(["c", "a", "b"]);

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }
    expect(derived.inventory.instances.find((i) => i.id === "all")?.dependencies).toEqual({
      cores: ["c", "a", "b"],
    });
  });

  it("rejects a non-array value for many slots", () => {
    const { A, Core, Catalog } = build();
    const population = createPopulation(A);
    const core = population.add(Core, { name: "a" });
    expect(() =>
      population.add(Catalog, {
        name: "all",
        cores: core as unknown as readonly never[],
      })
    ).toThrow(/must be an array/);
  });

  it("rejects wrong construct inside a many array", () => {
    const A = defineStructure("ManyDepsMismatch");
    const Core = A.construct("Core", {}, ({ name }) =>
      A.in(A.rootDirectory, A.dir(`cores/${name}`, {}))
    );
    const Other = A.construct("Other", {}, ({ name }) =>
      A.in(A.rootDirectory, A.dir(`other/${name}`, {}))
    );
    const Catalog = A.construct("Catalog", { cores: array(Core) }, ({ cores }) =>
      A.in(
        A.rootDirectory,
        A.file("c.ts", () => `${String(cores.length)}\n`, { mode: "sync" })
      )
    );
    const population = createPopulation(A);
    const other = population.add(Other, { name: "x" });
    expect(() => population.add(Catalog, { name: "all", cores: [other] })).toThrow(
      /expected construct "Core"/
    );
  });
});
