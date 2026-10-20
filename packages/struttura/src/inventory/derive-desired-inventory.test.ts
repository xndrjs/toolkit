import { describe, expect, it } from "vitest";

import { defineArchitecture, dir, file, root } from "../architecture/define-architecture";
import { deriveDesiredInventory } from "./derive-desired-inventory";
import { createPopulation } from "../population/create-population";

function pathsOf(inventory: { artifacts: readonly { path: string }[] }): string[] {
  return inventory.artifacts.map((a) => a.path).sort();
}

describe("deriveDesiredInventory", () => {
  it("yields the CleanArchitecture guide path set without writing the filesystem", () => {
    const A = defineArchitecture("CleanArchitecture");

    const corePackage = A.defineConstruct("CorePackage", ({ name }) => {
      const packageDirectory = dir(`packages/core-${name}`);
      const models = dir(`${packageDirectory.path}/models`);
      const ports = dir(`${packageDirectory.path}/ports`);
      const useCases = dir(`${packageDirectory.path}/use-cases`);
      const operations = dir(`${packageDirectory.path}/operations`);
      return {
        packageDirectory,
        models,
        ports,
        useCases,
        operations,
        modelsIndex: file("index.ts", models, "sync"),
        portsIndex: file("index.ts", ports, "sync"),
        useCasesIndex: file("index.ts", useCases, "sync"),
        operationsIndex: file("index.ts", operations, "sync"),
      };
    });

    const model = A.defineConstruct("Model", { core: corePackage }, ({ name, core }) => ({
      source: file(`${name}.model.ts`, core.artifacts.models, "scaffold"),
    }));

    const useCase = A.defineConstruct(
      "UseCase",
      { package: corePackage },
      ({ name, package: pkg }) => ({
        source: file(`${name}.use-case.ts`, pkg.artifacts.useCases, "scaffold"),
      })
    );

    const rootManifest = A.defineConstruct("RootManifest", () => ({
      packageJson: file("package.json", root, "scaffold"),
    }));

    const population = createPopulation(A);

    const pagebuilder = population.add(corePackage, { name: "pagebuilder" });
    population.add(model, { name: "page", core: pagebuilder });
    population.add(model, { name: "pageSlug", core: pagebuilder });
    population.add(useCase, { name: "resolvePage", package: pagebuilder });
    population.add(rootManifest, { name: "root-manifest" });

    const result = deriveDesiredInventory(population);

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
        "packages/core-pagebuilder/models/pageSlug.model.ts",
        "packages/core-pagebuilder/operations",
        "packages/core-pagebuilder/operations/index.ts",
        "packages/core-pagebuilder/ports",
        "packages/core-pagebuilder/ports/index.ts",
        "packages/core-pagebuilder/use-cases",
        "packages/core-pagebuilder/use-cases/index.ts",
        "packages/core-pagebuilder/use-cases/resolvePage.use-case.ts",
      ].sort()
    );

    const pageSource = result.inventory.artifacts.find(
      (a) => a.path === "packages/core-pagebuilder/models/page.model.ts"
    );
    expect(pageSource).toMatchObject({
      kind: "file",
      instanceId: "page",
      artifactKey: "source",
      constructName: "Model",
      mode: "scaffold",
      filename: "page.model.ts",
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
  });

  it("rejects duplicate effective instance ids before any disk work", () => {
    const A = defineArchitecture("DupIds");
    const thing = A.defineConstruct("Thing", ({ name }) => ({
      folder: dir(`things/${name}`),
    }));

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
    const A = defineArchitecture("BadFilename");
    const thing = A.defineConstruct("Thing", () => ({
      nested: file("sub/path.ts", root, "scaffold"),
    }));

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
    const A = defineArchitecture("OkFilenames");
    const thing = A.defineConstruct("Thing", ({ name }) => {
      const folder = dir(`things/${name}`);
      return {
        folder,
        keep: file(".gitkeep", folder, "scaffold"),
        model: file("page.model.ts", folder, "scaffold"),
      };
    });

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
    const A = defineArchitecture("DirCollision");
    const left = A.defineConstruct("Left", () => ({
      folder: dir("shared"),
    }));
    const right = A.defineConstruct("Right", () => ({
      folder: dir("shared"),
    }));

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
    const A = defineArchitecture("OwnsRoot");
    const thing = A.defineConstruct("Thing", () => ({
      everything: dir("."),
    }));

    const population = createPopulation(A);
    population.add(thing, { name: "x" });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics.some((d) => d.code === "root-owned")).toBe(true);
  });

  it("rejects colliding file paths from distinct artifacts", () => {
    const A = defineArchitecture("FileCollision");
    const thing = A.defineConstruct("Thing", () => ({
      a: file("same.ts", root, "scaffold"),
      b: file("same.ts", root, "sync"),
    }));

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
    const A = defineArchitecture("OrderIndependent");
    const corePackage = A.defineConstruct("CorePackage", ({ name }) => {
      const packageDirectory = dir(`packages/core-${name}`);
      const models = dir(`${packageDirectory.path}/models`);
      return {
        packageDirectory,
        models,
        modelsIndex: file("index.ts", models, "sync"),
      };
    });
    const model = A.defineConstruct("Model", { core: corePackage }, ({ name, core }) => ({
      source: file(`${name}.model.ts`, core.artifacts.models, "scaffold"),
    }));

    const population = createPopulation(A);
    // Models registered before their core dependency.
    const pagebuilderRef = { name: "pagebuilder" as const };
    // We need the core instance ref for deps — register core first to get the ref,
    // but derive must not depend on registration order of models vs other models.
    const pagebuilder = population.add(corePackage, pagebuilderRef);
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
