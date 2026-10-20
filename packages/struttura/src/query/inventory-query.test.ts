import { describe, expect, it } from "vitest";

import { defineArchitecture, dir, file, root } from "../architecture/define-architecture";
import { toKebabCase } from "../casing/casing";
import { deriveDesiredInventory } from "../inventory/derive-desired-inventory";
import { createPopulation } from "../population/create-population";
import { createInventoryQuery } from "./inventory-query";

function buildGuidePopulation() {
  const A = defineArchitecture("CleanArchitecture");

  const corePackage = A.defineConstruct("CorePackage", ({ name }) => {
    const packageDirectory = dir(`packages/core-${toKebabCase(name)}`);
    const models = dir(`${packageDirectory.path}/models`);
    return {
      packageDirectory,
      models,
      modelsIndex: file("index.ts", models, "sync"),
    };
  });

  const model = A.defineConstruct("Model", { core: corePackage }, ({ name, core }) => ({
    source: file(`${toKebabCase(name)}.model.ts`, core.artifacts.models, "scaffold"),
  }));

  const population = createPopulation(A);
  const pagebuilder = population.add(corePackage, { name: "pagebuilder" });
  population.add(model, { name: "page", core: pagebuilder });
  population.add(model, { name: "pageSlug", core: pagebuilder });
  return { population, corePackage, model, pagebuilder };
}

describe("createInventoryQuery", () => {
  it("lists instances of a construct and artifacts of an instance", () => {
    const { population, model, pagebuilder } = buildGuidePopulation();
    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }

    const query = createInventoryQuery(derived.inventory);

    expect(
      query
        .instances(model)
        .map((i) => i.id)
        .sort()
    ).toEqual(["page", "pageSlug"]);
    expect(query.instances("CorePackage").map((i) => i.id)).toEqual(["pagebuilder"]);

    const coreArtifacts = query.artifacts(pagebuilder);
    expect(coreArtifacts.map((a) => a.artifactKey).sort()).toEqual([
      "models",
      "modelsIndex",
      "packageDirectory",
    ]);
    expect(coreArtifacts.every((a) => a.instanceId === "pagebuilder")).toBe(true);
  });

  it("filesIn selects managed files by DirRef identity, excluding self by default", () => {
    const { population, pagebuilder } = buildGuidePopulation();
    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }

    const modelsDir = pagebuilder.artifacts.models;
    expect(modelsDir?.kind).toBe("directory");
    if (modelsDir?.kind !== "directory") {
      return;
    }

    const withoutSelf = createInventoryQuery(derived.inventory, {
      instanceId: "pagebuilder",
      artifactKey: "modelsIndex",
    });
    expect(
      withoutSelf.filesIn(modelsDir).map((a) => ({ path: a.path, instanceId: a.instanceId }))
    ).toEqual([
      { path: "packages/core-pagebuilder/models/page-slug.model.ts", instanceId: "pageSlug" },
      { path: "packages/core-pagebuilder/models/page.model.ts", instanceId: "page" },
    ]);

    const withSelf = createInventoryQuery(derived.inventory, {
      instanceId: "pagebuilder",
      artifactKey: "modelsIndex",
    });
    expect(withSelf.filesIn(modelsDir, true).map((a) => a.path)).toEqual([
      "packages/core-pagebuilder/models/index.ts",
      "packages/core-pagebuilder/models/page-slug.model.ts",
      "packages/core-pagebuilder/models/page.model.ts",
    ]);
  });

  it("filesIn matches directory identity, not path alone", () => {
    const A = defineArchitecture("PathVsIdentity");
    const owner = A.defineConstruct("Owner", () => {
      const folder = dir("shared");
      return {
        folder,
        keep: file(".gitkeep", folder, "scaffold", ""),
      };
    });
    const other = A.defineConstruct("Other", () => ({
      // Same path string, distinct directory artifact identity.
      folder: dir("shared-other"),
      nested: file("x.ts", dir("shared"), "scaffold", "export {};\n"),
    }));

    const population = createPopulation(A);
    const owned = population.add(owner, { name: "owner" });
    population.add(other, { name: "other" });

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }

    const query = createInventoryQuery(derived.inventory);
    const folderRef = owned.artifacts.folder;
    expect(folderRef?.kind).toBe("directory");
    if (folderRef?.kind !== "directory") {
      return;
    }
    // Inline dir("shared") on Other does not share Owner's DirRef identity.
    expect(query.filesIn(folderRef).map((a) => a.path)).toEqual(["shared/.gitkeep"]);
  });

  it("filesIn on root returns files targeting root", () => {
    const A = defineArchitecture("RootFiles");
    const pkg = A.defineConstruct("Pkg", () => ({
      packageJson: file("package.json", root, "scaffold", "{}\n"),
      readme: file("README.md", root, "scaffold", "# hi\n"),
    }));
    const population = createPopulation(A);
    population.add(pkg, { name: "root-files" });

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }

    const query = createInventoryQuery(derived.inventory);
    expect(query.filesIn(root).map((a) => a.path)).toEqual(["README.md", "package.json"]);
  });
});
