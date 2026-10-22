import { describe, expect, it } from "vitest";

import { defineStructure } from "../structure/define-structure";
import { toKebabCase } from "../casing/casing";
import { createPopulation } from "../population/create-population";
import { buildGuidePopulation } from "../test-fixtures/guide-structure";
import { deriveDesiredInventory } from "./derive-desired-inventory";

function pathsOf(inventory: { artifacts: readonly { path: string }[] }): string[] {
  return inventory.artifacts.map((a) => a.path).sort();
}

describe("deriveDesiredInventory", () => {
  it("yields the Clean Architecture guide path set without writing the filesystem", () => {
    const result = deriveDesiredInventory(buildGuidePopulation());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(pathsOf(result.inventory)).toEqual(
      [
        "package.json",
        "packages/core-pagebuilder",
        "packages/core-pagebuilder/models",
        "packages/core-pagebuilder/models/index.ts",
        "packages/core-pagebuilder/models/page.model.ts",
        "packages/core-pagebuilder/models/page-slug.model.ts",
        "packages/core-pagebuilder/operations",
        "packages/core-pagebuilder/operations/index.ts",
        "packages/core-pagebuilder/ports",
        "packages/core-pagebuilder/ports/index.ts",
        "packages/core-pagebuilder/use-cases",
        "packages/core-pagebuilder/use-cases/index.ts",
        "packages/core-pagebuilder/use-cases/resolve-page.use-case.ts",
      ].sort()
    );

    const pageSource = result.inventory.artifacts.find(
      (a) => a.path === "packages/core-pagebuilder/models/page.model.ts"
    );
    expect(pageSource).toMatchObject({
      kind: "file",
      instanceId: "page",
      artifactKey: ".",
      constructName: "Model",
      mode: "scaffold",
      filename: "page.model.ts",
    });

    const pageSlugSource = result.inventory.artifacts.find(
      (a) => a.path === "packages/core-pagebuilder/models/page-slug.model.ts"
    );
    expect(pageSlugSource).toMatchObject({
      kind: "file",
      instanceId: "pageSlug",
      artifactKey: ".",
      filename: "page-slug.model.ts",
    });

    const modelsDir = result.inventory.artifacts.find(
      (a) => a.path === "packages/core-pagebuilder/models"
    );
    expect(modelsDir).toMatchObject({
      kind: "directory",
      instanceId: "pagebuilder",
      artifactKey: "models",
      constructName: "CorePackage",
    });

    const modelsIndex = result.inventory.artifacts.find(
      (a) => a.path === "packages/core-pagebuilder/models/index.ts"
    );
    expect(modelsIndex).toMatchObject({
      instanceId: "pagebuilder",
      artifactKey: "models.index",
      directory: { kind: "artifact", instanceId: "pagebuilder", artifactKey: "models" },
    });

    const coreRoot = result.inventory.artifacts.find(
      (a) => a.path === "packages/core-pagebuilder" && a.kind === "directory"
    );
    expect(coreRoot).toMatchObject({
      instanceId: "pagebuilder",
      artifactKey: ".",
      constructName: "CorePackage",
    });
  });

  it("rejects duplicate effective instance ids before any disk work", () => {
    const A = defineStructure("DupIds");
    const thing = A.construct("Thing", {}, ({ name }) =>
      A.in(A.rootDirectory, A.dir(`things/${name}`, {}))
    );

    const population = createPopulation(A);
    population.add(thing, { name: "alpha" });
    population.add(thing, { id: "alpha", name: "beta" });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics.some((d) => d.code === "duplicate-effective-id")).toBe(true);
  });

  it("rejects invalid filenames via regex", () => {
    const A = defineStructure("BadFilename");
    const thing = A.construct("Thing", {}, () => A.in(A.rootDirectory, A.file("sub/path.ts", "")));

    const population = createPopulation(A);
    population.add(thing, { name: "x" });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics.some((d) => d.code === "invalid-filename")).toBe(true);
  });

  it("accepts .gitkeep and dotted compound filenames", () => {
    const A = defineStructure("OkFilenames");
    const thing = A.construct("Thing", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`things/${name}`, {
          keep: A.file(".gitkeep", ""),
          model: A.file("page.model.ts", ""),
        })
      )
    );

    const population = createPopulation(A);
    population.add(thing, { name: "x" });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(pathsOf(result.inventory)).toEqual(
      ["things/x", "things/x/.gitkeep", "things/x/page.model.ts"].sort()
    );
  });

  it("rejects two distinct directory artifacts on the same path", () => {
    const A = defineStructure("DirCollision");
    const left = A.construct("Left", {}, () => A.in(A.rootDirectory, A.dir("shared", {})));
    const right = A.construct("Right", {}, () => A.in(A.rootDirectory, A.dir("shared", {})));

    const population = createPopulation(A);
    population.add(left, { name: "a" });
    population.add(right, { name: "b" });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics.some((d) => d.code === "directory-path-collision")).toBe(true);
  });

  it("rejects a construct that claims the materialization root as a directory artifact", () => {
    const A = defineStructure("OwnsRoot");
    const thing = A.construct("Thing", {}, () => A.in(A.rootDirectory, A.dir(".", {})));

    const population = createPopulation(A);
    population.add(thing, { name: "x" });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics.some((d) => d.code === "invalid-placement-root")).toBe(true);
  });

  it("rejects colliding file paths from distinct artifacts", () => {
    const A = defineStructure("FileCollision");
    const thing = A.construct("Thing", {}, () =>
      A.in(A.rootDirectory, {
        a: A.file("same.ts", ""),
        b: A.file("same.ts", "", { mode: "sync" }),
      })
    );

    const population = createPopulation(A);
    population.add(thing, { name: "x" });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics.some((d) => d.code === "path-collision")).toBe(true);
  });

  it("is independent of instance registration order", () => {
    const A = defineStructure("OrderIndependent");
    const corePackage = A.construct("CorePackage", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`packages/core-${toKebabCase(name)}`, {
          models: A.dir({
            index: A.file("index.ts", "", { mode: "sync" }),
          }),
        })
      )
    );
    const model = A.construct("Model", { core: corePackage }, ({ name, core }) =>
      A.in(core.models, A.file(`${toKebabCase(name)}.model.ts`, ""))
    );

    const population = createPopulation(A);
    const pagebuilder = population.add(corePackage, { name: "pagebuilder" });
    population.add(model, { name: "pageSlug", core: pagebuilder });
    population.add(model, { name: "page", core: pagebuilder });

    const reversed = createPopulation(A);
    const pb2 = reversed.add(corePackage, { name: "pagebuilder" });
    reversed.add(model, { name: "page", core: pb2 });
    reversed.add(model, { name: "pageSlug", core: pb2 });

    const a = deriveDesiredInventory(population);
    const b = deriveDesiredInventory(reversed);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) {
      return;
    }
    expect(pathsOf(a.inventory)).toEqual(pathsOf(b.inventory));
  });
});
