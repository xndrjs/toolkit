import { describe, expect, it } from "vitest";

import { defineArchitecture, dir, file } from "../architecture/define-architecture";
import type { FileRenderContext } from "../apply/render-contents";
import { toKebabCase } from "../casing/casing";
import type { DesiredArtifact } from "../inventory/derive-desired-inventory";
import { deriveDesiredInventory } from "../inventory/derive-desired-inventory";
import { createPopulation } from "../population/create-population";
import { createInventoryQuery } from "../query/inventory-query";
import { relativeTsModule, renderTsBarrel } from "./barrel";

function fileArtifact(path: string): DesiredArtifact {
  return {
    instanceId: "x",
    constructName: "Model",
    artifactKey: "source",
    kind: "file",
    path,
    mode: "scaffold",
    filename: path.split("/").pop()!,
    directory: { kind: "root" },
  };
}

describe("relativeTsModule / renderTsBarrel", () => {
  it("builds relative import paths and strips .ts/.tsx", () => {
    expect(
      relativeTsModule(
        "packages/core-pagebuilder/models",
        fileArtifact("packages/core-pagebuilder/models/page.shape.ts")
      )
    ).toBe("./page.shape");
    expect(
      relativeTsModule(
        "packages/infrastructure-contentful",
        fileArtifact("packages/infrastructure-contentful/loaders/page.loader.ts")
      )
    ).toBe("./loaders/page.loader");
  });

  it("renders an export * barrel from path + files", () => {
    expect(renderTsBarrel("models", [])).toBe("");
    expect(
      renderTsBarrel("models", [
        fileArtifact("models/page.shape.ts"),
        fileArtifact("models/page-slug.primitive.ts"),
      ])
    ).toBe(`export * from "./page.shape";\nexport * from "./page-slug.primitive";\n`);
  });

  it("renders a barrel from FileRenderContext + DirDescriptor", () => {
    const A = defineArchitecture("CleanArchitecture");
    const corePackage = A.defineConstruct("CorePackage", ({ name }) => {
      const packageDirectory = dir(`packages/core-${toKebabCase(name)}`);
      const models = dir(`${packageDirectory.path}/models`);
      return {
        packageDirectory,
        models,
        modelsIndex: file({
          filename: "index.ts",
          directory: models,
          mode: "sync",
          content: "// barrel\n",
        }),
      };
    });
    const model = A.defineConstruct("Model", { core: corePackage })(({ name, core }) => ({
      source: file({
        filename: `${toKebabCase(name)}.model.ts`,
        directory: core.artifacts.models,
        mode: "scaffold",
      }),
    }));
    const population = createPopulation(A);
    const pagebuilder = population.add(corePackage, { name: "pagebuilder" });
    population.add(model, { name: "page", core: pagebuilder });

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }
    const instance = population.instances.find((i) => i.id === "pagebuilder")!;
    const models = dir("packages/core-pagebuilder/models");
    const ctx: FileRenderContext = {
      name: instance.name,
      id: instance.id,
      artifacts: instance.artifacts,
      query: createInventoryQuery(derived.inventory, {
        instanceId: "pagebuilder",
        artifactKey: "modelsIndex",
      }),
    };

    expect(renderTsBarrel(ctx, models)).toBe('export * from "./page.model";\n');
  });
});
