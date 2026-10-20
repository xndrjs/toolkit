import { describe, expect, it } from "vitest";

import { defineArchitecture, dir, file } from "../architecture/define-architecture";
import type { FileRenderContext } from "../apply/render-contents";
import { toKebabCase } from "../casing/casing";
import { deriveDesiredInventory } from "../inventory/derive-desired-inventory";
import { createPopulation } from "../population/create-population";
import { createInventoryQuery } from "./inventory-query";
import { filesInDirectory } from "./files-in-directory";

function buildPopulation() {
  const A = defineArchitecture("CleanArchitecture");
  const corePackage = A.defineConstruct("CorePackage", ({ name }) => {
    const packageDirectory = dir(`packages/core-${toKebabCase(name)}`);
    const models = dir(`${packageDirectory.path}/models`);
    return {
      packageDirectory,
      models,
      modelsIndex: file("index.ts", models, "sync", "// barrel\n"),
    };
  });
  const model = A.defineConstruct("Model", { core: corePackage }, ({ name, core }) => ({
    source: file(`${toKebabCase(name)}.model.ts`, core.artifacts.models, "scaffold"),
  }));

  const population = createPopulation(A);
  const pagebuilder = population.add(corePackage, { name: "pagebuilder" });
  population.add(model, { name: "page", core: pagebuilder });
  return { population, pagebuilder };
}

function renderCtx(
  population: ReturnType<typeof buildPopulation>["population"],
  instanceId: string,
  artifactKey: string
): FileRenderContext {
  const derived = deriveDesiredInventory(population);
  if (!derived.ok) {
    throw new Error(derived.diagnostics.map((d) => d.message).join("; "));
  }
  const instance = population.instances.find((i) => i.id === instanceId);
  if (!instance) {
    throw new Error(`missing instance ${instanceId}`);
  }
  return {
    name: instance.name,
    id: instance.id,
    artifacts: instance.artifacts,
    query: createInventoryQuery(derived.inventory, { instanceId, artifactKey }),
  };
}

describe("filesInDirectory", () => {
  it("resolves a sibling directory artifact key and lists managed files", () => {
    const { population } = buildPopulation();
    const ctx = renderCtx(population, "pagebuilder", "modelsIndex");
    expect(filesInDirectory(ctx, "models").map((a) => a.path)).toEqual([
      "packages/core-pagebuilder/models/page.model.ts",
    ]);
  });

  it("accepts an explicit DirRef", () => {
    const { population } = buildPopulation();
    const ctx = renderCtx(population, "pagebuilder", "modelsIndex");
    const models = ctx.artifacts.models;
    expect(models?.kind).toBe("directory");
    if (models?.kind !== "directory") {
      return;
    }
    expect(filesInDirectory(ctx, models).map((a) => a.path)).toEqual([
      "packages/core-pagebuilder/models/page.model.ts",
    ]);
  });

  it("throws when the artifact key is missing or not a directory", () => {
    const { population } = buildPopulation();
    const ctx = renderCtx(population, "pagebuilder", "modelsIndex");
    expect(() => filesInDirectory(ctx, "missing")).toThrow(/Expected directory artifact "missing"/);
    expect(() => filesInDirectory(ctx, "modelsIndex")).toThrow(
      /Expected directory artifact "modelsIndex"/
    );
  });

  it("resolves a DirDescriptor by path against bound directory artifacts", () => {
    const { population } = buildPopulation();
    const ctx = renderCtx(population, "pagebuilder", "modelsIndex");
    const models = ctx.artifacts.models;
    expect(models?.kind).toBe("directory");
    if (models?.kind !== "directory") {
      return;
    }
    const descriptor = dir(models.path);
    expect(filesInDirectory(ctx, descriptor).map((a) => a.path)).toEqual([
      "packages/core-pagebuilder/models/page.model.ts",
    ]);
  });
});
