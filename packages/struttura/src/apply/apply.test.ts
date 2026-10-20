import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { FileMode } from "../architecture/artifacts";
import { defineArchitecture, dir, file, root } from "../architecture/define-architecture";
import { toKebabCase } from "../casing/casing";
import { createPopulation } from "../population/create-population";
import { apply } from "./apply";
import { MANIFEST_RELATIVE_PATH, readManifest } from "./manifest";

function pathsOf(inventory: { artifacts: readonly { path: string }[] }): string[] {
  return inventory.artifacts.map((a) => a.path).sort();
}

function listRelativeFiles(rootDir: string, prefix = ""): string[] {
  const entries = readdirSync(join(rootDir, prefix), { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listRelativeFiles(rootDir, rel));
    } else {
      out.push(rel);
    }
  }
  return out.sort();
}

function buildGuidePopulation() {
  const A = defineArchitecture("CleanArchitecture");

  const corePackage = A.defineConstruct("CorePackage", ({ name }) => {
    const packageDirectory = dir(`packages/core-${toKebabCase(name)}`);
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
      modelsIndex: file("index.ts", models, "sync", "// models barrel\n"),
      portsIndex: file("index.ts", ports, "sync", "// ports barrel\n"),
      useCasesIndex: file("index.ts", useCases, "sync", "// use-cases barrel\n"),
      operationsIndex: file("index.ts", operations, "sync", "// operations barrel\n"),
    };
  });

  const model = A.defineConstruct("Model", { core: corePackage }, ({ name, core }) => ({
    source: file(
      `${toKebabCase(name)}.model.ts`,
      core.artifacts.models,
      "scaffold",
      `export type ${name} = { id: string };\n`
    ),
  }));

  const useCase = A.defineConstruct(
    "UseCase",
    { package: corePackage },
    ({ name, package: pkg }) => ({
      source: file(
        `${toKebabCase(name)}.use-case.ts`,
        pkg.artifacts.useCases,
        "scaffold",
        `export function ${name}() {}\n`
      ),
    })
  );

  const packageJson = A.defineConstruct("PackageJson", () => ({
    packageJson: file("package.json", root, "scaffold", '{ "name": "project" }\n'),
  }));

  const population = createPopulation(A);
  const pagebuilder = population.add(corePackage, { name: "pagebuilder" });
  population.add(model, { name: "page", core: pagebuilder });
  population.add(model, { name: "pageSlug", core: pagebuilder });
  population.add(useCase, { name: "resolvePage", package: pagebuilder });
  population.add(packageJson, { name: "packageJson" });
  return population;
}

describe("apply", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("materializes an empty root and writes a success manifest outside it", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-apply-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");

    const first = apply(buildGuidePopulation(), { architectureDir, materializationRoot });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    expect(first.mutated).toBe(true);
    expect(first.plan.length).toBeGreaterThan(0);
    expect(pathsOf(first.inventory)).toEqual(
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

    expect(listRelativeFiles(materializationRoot)).toEqual(
      [
        "package.json",
        "packages/core-pagebuilder/models/index.ts",
        "packages/core-pagebuilder/models/page.model.ts",
        "packages/core-pagebuilder/models/page-slug.model.ts",
        "packages/core-pagebuilder/operations/index.ts",
        "packages/core-pagebuilder/ports/index.ts",
        "packages/core-pagebuilder/use-cases/index.ts",
        "packages/core-pagebuilder/use-cases/resolve-page.use-case.ts",
      ].sort()
    );

    expect(existsSync(join(materializationRoot, "packages/core-pagebuilder/ports"))).toBe(true);
    expect(readFileSync(join(materializationRoot, "package.json"), "utf8")).toBe(
      '{ "name": "project" }\n'
    );
    expect(
      readFileSync(
        join(materializationRoot, "packages/core-pagebuilder/models/page.model.ts"),
        "utf8"
      )
    ).toBe("export type page = { id: string };\n");

    const manifestFile = join(architectureDir, MANIFEST_RELATIVE_PATH);
    expect(existsSync(manifestFile)).toBe(true);
    expect(existsSync(join(materializationRoot, ".struttura"))).toBe(false);

    const manifest = readManifest(architectureDir);
    expect(manifest).toBeDefined();
    expect(manifest?.architectureName).toBe("CleanArchitecture");
    expect(manifest?.materializationRoot).toBe("../project");
    expect(manifest?.instances.map((i) => i.id).sort()).toEqual(
      ["page", "pageSlug", "pagebuilder", "packageJson", "resolvePage"].sort()
    );
    expect(manifest?.artifacts.map((a) => a.path).sort()).toEqual(pathsOf(first.inventory));

    const pageSource = manifest?.artifacts.find(
      (a) => a.path === "packages/core-pagebuilder/models/page.model.ts"
    );
    expect(pageSource).toMatchObject({
      kind: "file",
      instanceId: "page",
      artifactKey: "source",
      constructName: "Model",
      mode: "scaffold",
      filename: "page.model.ts",
      directory: { kind: "artifact", instanceId: "pagebuilder", artifactKey: "models" },
    });
  });

  it("is a no-op on re-apply when inputs and disk still match", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-apply-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");
    const options = { architectureDir, materializationRoot };

    const first = apply(buildGuidePopulation(), options);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const snapshot = new Map(
      listRelativeFiles(materializationRoot).map((rel) => {
        const abs = join(materializationRoot, rel);
        return [rel, { content: readFileSync(abs, "utf8"), mtimeMs: statSync(abs).mtimeMs }];
      })
    );
    const manifestBefore = readFileSync(join(architectureDir, MANIFEST_RELATIVE_PATH), "utf8");

    const second = apply(buildGuidePopulation(), options);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    expect(second.plan).toEqual([]);
    expect(second.mutated).toBe(false);
    expect(readFileSync(join(architectureDir, MANIFEST_RELATIVE_PATH), "utf8")).toBe(
      manifestBefore
    );

    for (const [rel, before] of snapshot) {
      const abs = join(materializationRoot, rel);
      expect(readFileSync(abs, "utf8")).toBe(before.content);
      expect(statSync(abs).mtimeMs).toBe(before.mtimeMs);
    }
  });

  it("refuses to overwrite an unmanaged file already on disk", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-apply-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");

    const A = defineArchitecture("Conflict");
    const thing = A.defineConstruct("Thing", () => ({
      packageJson: file("package.json", root, "scaffold", '{ "name": "managed" }\n'),
    }));
    const population = createPopulation(A);
    population.add(thing, { name: "root-file" });

    mkdirSync(materializationRoot, { recursive: true });
    writeFileSync(join(materializationRoot, "package.json"), '{ "name": "foreign" }\n');

    const result = apply(population, { architectureDir, materializationRoot });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics.some((d) => d.message.includes("unmanaged file"))).toBe(true);
    expect(readFileSync(join(materializationRoot, "package.json"), "utf8")).toBe(
      '{ "name": "foreign" }\n'
    );
    expect(existsSync(join(architectureDir, MANIFEST_RELATIVE_PATH))).toBe(false);
  });
});

function buildSingleFilePopulation(mode: FileMode, content: string) {
  const A = defineArchitecture("Lifecycle");
  const thing = A.defineConstruct("Thing", () => ({
    source: file("thing.ts", root, mode, content),
  }));
  const population = createPopulation(A);
  population.add(thing, { name: "thing" });
  return population;
}

describe("scaffold vs sync lifecycle", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("preserves authored scaffold content on re-apply", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-lifecycle-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");
    const options = { architectureDir, materializationRoot };
    const path = join(materializationRoot, "thing.ts");

    const first = apply(buildSingleFilePopulation("scaffold", "export const seed = 1;\n"), options);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const authored = "export const authored = true;\n";
    writeFileSync(path, authored);

    const second = apply(
      buildSingleFilePopulation("scaffold", "export const seed = 2;\n"),
      options
    );
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.plan).toEqual([]);
    expect(readFileSync(path, "utf8")).toBe(authored);
  });

  it("regenerates sync content when the derived template changes", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-lifecycle-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");
    const options = { architectureDir, materializationRoot };
    const path = join(materializationRoot, "thing.ts");

    const first = apply(buildSingleFilePopulation("sync", "export const a = 1;\n"), options);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(readFileSync(path, "utf8")).toBe("export const a = 1;\n");

    const second = apply(buildSingleFilePopulation("sync", "export const a = 2;\n"), options);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.plan).toEqual([
      expect.objectContaining({
        type: "write",
        path: "thing.ts",
        content: "export const a = 2;\n",
        mode: "sync",
      }),
    ]);
    expect(readFileSync(path, "utf8")).toBe("export const a = 2;\n");
  });

  it("restores missing managed files for both scaffold and sync", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-lifecycle-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");

    for (const mode of ["scaffold", "sync"] as const) {
      const options = {
        architectureDir: join(architectureDir, mode),
        materializationRoot: join(materializationRoot, mode),
      };
      const path = join(options.materializationRoot, "thing.ts");
      const template = `export const mode = "${mode}";\n`;

      const first = apply(buildSingleFilePopulation(mode, template), options);
      expect(first.ok).toBe(true);
      if (!first.ok) {
        return;
      }

      rmSync(path);
      expect(existsSync(path)).toBe(false);

      const second = apply(buildSingleFilePopulation(mode, template), options);
      expect(second.ok).toBe(true);
      if (!second.ok) {
        return;
      }
      expect(second.plan).toEqual([
        expect.objectContaining({ type: "write", path: "thing.ts", mode, content: template }),
      ]);
      expect(readFileSync(path, "utf8")).toBe(template);
    }
  });

  it("overwrites authored content when mode switches from scaffold to sync", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-lifecycle-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");
    const options = { architectureDir, materializationRoot };
    const path = join(materializationRoot, "thing.ts");

    const first = apply(buildSingleFilePopulation("scaffold", "export const seed = 1;\n"), options);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    writeFileSync(path, "export const authored = true;\n");

    const syncContent = "export const synced = true;\n";
    const second = apply(buildSingleFilePopulation("sync", syncContent), options);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.plan).toEqual([
      expect.objectContaining({
        type: "write",
        path: "thing.ts",
        content: syncContent,
        mode: "sync",
      }),
    ]);
    expect(readFileSync(path, "utf8")).toBe(syncContent);

    const manifest = readManifest(architectureDir);
    expect(manifest?.artifacts.find((a) => a.path === "thing.ts")).toMatchObject({
      mode: "sync",
    });
  });
});
