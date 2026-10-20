import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { DesiredArtifact } from "../inventory/derive-desired-inventory";
import { defineArchitecture, dir, file, root } from "../architecture/define-architecture";
import { toKebabCase } from "../casing/casing";
import { createPopulation, type Population } from "../population/create-population";
import type { FileRenderContext } from "./render-contents";
import { apply } from "./apply";
import { readManifest } from "./manifest";

/** Sync barrel from filesIn: relative module path from the selected artifact path. */
function renderModelsBarrel(ctx: FileRenderContext): string {
  const models = ctx.artifacts.models;
  if (!models || models.kind !== "directory") {
    return "";
  }
  const files = ctx.query.filesIn(models);
  if (files.length === 0) {
    return "";
  }
  return `${files.map((f) => `export * from "${relativeTsModule(models.path, f)}";`).join("\n")}\n`;
}

function relativeTsModule(directoryPath: string, file: DesiredArtifact): string {
  const prefix = directoryPath === "" ? "" : `${directoryPath}/`;
  if (!file.path.startsWith(prefix)) {
    throw new Error(`File "${file.path}" is not under "${directoryPath}"`);
  }
  const relative = file.path.slice(prefix.length);
  const withoutExt = relative.replace(/\.tsx?$/, "");
  return withoutExt.startsWith(".") ? withoutExt : `./${withoutExt}`;
}

function buildPagebuilderArchitecture() {
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
        content: (ctx: FileRenderContext) => renderModelsBarrel(ctx),
      }),
    };
  });

  const model = A.defineConstruct("Model", { core: corePackage }, ({ name, core }) => ({
    source: file({
      filename: `${toKebabCase(name)}.model.ts`,
      directory: core.artifacts.models,
      mode: "scaffold",
      content: `export type ${name} = { id: string };\n`,
    }),
  }));

  const packageJson = A.defineConstruct("PackageJson", () => ({
    packageJson: file({
      filename: "package.json",
      directory: root,
      mode: "scaffold",
      content: '{ "name": "project" }\n',
    }),
  }));

  return { A, corePackage, model, packageJson };
}

function populateGuide(models: readonly string[] = ["page", "pageSlug"]): Population {
  const { A, corePackage, model, packageJson } = buildPagebuilderArchitecture();
  const population = createPopulation(A);
  const pagebuilder = population.add(corePackage, { name: "pagebuilder" });
  for (const name of models) {
    population.add(model, { name, core: pagebuilder });
  }
  population.add(packageJson, { name: "packageJson" });
  return population;
}

describe("cross-construct DirRef + filesIn barrel", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("lands model files under core.artifacts.models and syncs the barrel", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-barrel-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");

    const result = apply(populateGuide(), { architectureDir, materializationRoot });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const barrelPath = join(materializationRoot, "packages/core-pagebuilder/models/index.ts");
    expect(readFileSync(barrelPath, "utf8")).toBe(
      ['export * from "./page-slug.model";', 'export * from "./page.model";', ""].join("\n")
    );

    expect(
      readFileSync(
        join(materializationRoot, "packages/core-pagebuilder/models/page.model.ts"),
        "utf8"
      )
    ).toBe("export type page = { id: string };\n");

    const manifest = readManifest(architectureDir);
    const pageSource = manifest?.artifacts.find(
      (a) => a.path === "packages/core-pagebuilder/models/page.model.ts"
    );
    expect(pageSource).toMatchObject({
      instanceId: "page",
      constructName: "Model",
      artifactKey: "source",
      directory: { kind: "artifact", instanceId: "pagebuilder", artifactKey: "models" },
    });

    const modelsDir = manifest?.artifacts.find(
      (a) => a.path === "packages/core-pagebuilder/models"
    );
    expect(modelsDir).toMatchObject({
      instanceId: "pagebuilder",
      constructName: "CorePackage",
      artifactKey: "models",
      kind: "directory",
    });

    const modelsIndex = manifest?.artifacts.find(
      (a) => a.path === "packages/core-pagebuilder/models/index.ts"
    );
    expect(modelsIndex).toMatchObject({
      instanceId: "pagebuilder",
      constructName: "CorePackage",
      artifactKey: "modelsIndex",
      mode: "sync",
    });
  });

  it("updates the barrel when models are added or removed", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-barrel-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");
    const options = { architectureDir, materializationRoot };
    const barrelPath = join(materializationRoot, "packages/core-pagebuilder/models/index.ts");

    const first = apply(populateGuide(["page"]), options);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(readFileSync(barrelPath, "utf8")).toBe('export * from "./page.model";\n');

    const second = apply(populateGuide(["page", "pageSlug"]), options);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(readFileSync(barrelPath, "utf8")).toBe(
      ['export * from "./page-slug.model";', 'export * from "./page.model";', ""].join("\n")
    );
    expect(
      second.plan.some((op) => op.type === "write" && op.path.endsWith("models/index.ts"))
    ).toBe(true);

    const third = apply(populateGuide(["pageSlug"]), options);
    expect(third.ok).toBe(true);
    if (!third.ok) {
      return;
    }
    expect(readFileSync(barrelPath, "utf8")).toBe('export * from "./page-slug.model";\n');
  });

  it("excludes the barrel itself from filesIn by default", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-barrel-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");

    const result = apply(populateGuide(["page"]), { architectureDir, materializationRoot });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const content = readFileSync(
      join(materializationRoot, "packages/core-pagebuilder/models/index.ts"),
      "utf8"
    );
    expect(content).not.toContain("./index");
    expect(content).toBe('export * from "./page.model";\n');
  });
});
