import { describe, expect, it } from "vitest";

import { defineArchitecture } from "../architecture/define-architecture";
import { toKebabCase } from "../casing/casing";
import type { DesiredArtifact } from "../inventory/derive-desired-inventory";
import { deriveDesiredInventory } from "../inventory/derive-desired-inventory";
import { createPopulation } from "../population/create-population";
import { artifactIdentity } from "../apply/manifest";
import { renderFileContents } from "../apply/render-contents";
import { relativeTsModule, renderTsBarrel, tsBarrelIndex } from "./barrel";

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
    expect(relativeTsModule("", fileArtifact("readme.md"))).toBe("./readme.md");
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
});

describe("tsBarrelIndex", () => {
  it("returns a FileContentFn that barrels siblings under ctx.directory", () => {
    const A = defineArchitecture("TsBarrelSiblings");
    const ModelsModule = A.construct("ModelsModule", {}, () =>
      A.in(
        A.rootDirectory,
        A.dir("packages/core-x/models", {
          index: A.file("index.ts", tsBarrelIndex(), { mode: "sync" }),
        })
      )
    );
    const Shape = A.construct("Shape", { models: ModelsModule }, ({ name, models }) =>
      A.in(models, A.file(`${toKebabCase(name)}.model.ts`, `export type ${name} = {};\n`))
    );

    const population = createPopulation(A);
    const models = population.add(ModelsModule, { name: "models" });
    population.add(Shape, { name: "page", models });
    population.add(Shape, { name: "pageSlug", models });

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }

    const contents = renderFileContents(population, derived.inventory);
    expect(contents.get(artifactIdentity({ instanceId: "models", artifactKey: "index" }))).toBe(
      `export * from "./page-slug.model";\nexport * from "./page.model";\n`
    );
  });

  it("passes recursive / exclude through to filesIn", () => {
    const A = defineArchitecture("TsBarrelRecursive");
    const ModelsModule = A.construct("ModelsModule", {}, () =>
      A.in(
        A.rootDirectory,
        A.dir("packages/core-x/models", {
          index: A.file("index.ts", tsBarrelIndex({ recursive: true, exclude: /identity\// }), {
            mode: "sync",
          }),
        })
      )
    );
    const FlatShape = A.construct("FlatShape", { models: ModelsModule }, ({ name, models }) =>
      A.in(models, A.file(`${toKebabCase(name)}.model.ts`, `export type ${name} = {};\n`))
    );
    const NestedShape = A.construct("NestedShape", { models: ModelsModule }, ({ name, models }) =>
      A.in(
        models,
        A.dir("identity", {
          source: A.file(`${toKebabCase(name)}.model.ts`, `export type ${name} = {};\n`),
        })
      )
    );

    const population = createPopulation(A);
    const models = population.add(ModelsModule, { name: "models" });
    population.add(FlatShape, { name: "page", models });
    population.add(NestedShape, { name: "nested", models });

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }

    const contents = renderFileContents(population, derived.inventory);
    expect(contents.get(artifactIdentity({ instanceId: "models", artifactKey: "index" }))).toBe(
      `export * from "./page.model";\n`
    );
  });

  it("emits export {} by default when the directory has no other managed files", () => {
    const A = defineArchitecture("TsBarrelEmpty");
    const ModelsModule = A.construct("ModelsModule", {}, () =>
      A.in(
        A.rootDirectory,
        A.dir("packages/core-x/models", {
          index: A.file("index.ts", tsBarrelIndex({ recursive: true }), { mode: "sync" }),
        })
      )
    );

    const population = createPopulation(A);
    population.add(ModelsModule, { name: "models" });

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }

    const contents = renderFileContents(population, derived.inventory);
    expect(contents.get(artifactIdentity({ instanceId: "models", artifactKey: "index" }))).toBe(
      "export {};\n"
    );
  });

  it("uses options.empty when the directory has no other managed files", () => {
    const A = defineArchitecture("TsBarrelCustomEmpty");
    const ModelsModule = A.construct("ModelsModule", {}, () =>
      A.in(
        A.rootDirectory,
        A.dir("packages/core-x/models", {
          index: A.file("index.ts", tsBarrelIndex({ empty: "// no modules yet\n" }), {
            mode: "sync",
          }),
        })
      )
    );

    const population = createPopulation(A);
    population.add(ModelsModule, { name: "models" });

    const derived = deriveDesiredInventory(population);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      return;
    }

    const contents = renderFileContents(population, derived.inventory);
    expect(contents.get(artifactIdentity({ instanceId: "models", artifactKey: "index" }))).toBe(
      "// no modules yet\n"
    );
  });
});
