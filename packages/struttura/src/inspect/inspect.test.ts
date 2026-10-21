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

import { defineArchitecture, dir, file, root } from "../architecture/define-architecture";
import { toKebabCase } from "../casing/casing";
import { createPopulation } from "../population/create-population";
import { apply } from "../apply/apply";
import { MANIFEST_RELATIVE_PATH, readManifest } from "../apply/manifest";
import { inspect } from "./inspect";

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
      modelsIndex: file({
        filename: "index.ts",
        directory: models,
        mode: "sync",
        content: "// models barrel\n",
      }),
      portsIndex: file({
        filename: "index.ts",
        directory: ports,
        mode: "sync",
        content: "// ports barrel\n",
      }),
      useCasesIndex: file({
        filename: "index.ts",
        directory: useCases,
        mode: "sync",
        content: "// use-cases barrel\n",
      }),
      operationsIndex: file({
        filename: "index.ts",
        directory: operations,
        mode: "sync",
        content: "// operations barrel\n",
      }),
    };
  });

  const model = A.defineConstruct("Model", { core: corePackage })(({ name, core }) => ({
    source: file({
      filename: `${toKebabCase(name)}.model.ts`,
      directory: core.artifacts.models,
      mode: "scaffold",
      content: `export type ${name} = { id: string };\n`,
    }),
  }));

  const useCase = A.defineConstruct("UseCase", { package: corePackage })(
    ({ name, package: pkg }) => ({
      source: file({
        filename: `${toKebabCase(name)}.use-case.ts`,
        directory: pkg.artifacts.useCases,
        mode: "scaffold",
        content: `export function ${name}() {}\n`,
      }),
    })
  );

  const packageJson = A.defineConstruct("PackageJson", () => ({
    packageJson: file({
      filename: "package.json",
      directory: root,
      mode: "scaffold",
      content: '{ "name": "project" }\n',
    }),
  }));

  const population = createPopulation(A);
  const pagebuilder = population.add(corePackage, { name: "pagebuilder" });
  population.add(model, { name: "page", core: pagebuilder });
  population.add(model, { name: "pageSlug", core: pagebuilder });
  population.add(useCase, { name: "resolvePage", package: pagebuilder });
  population.add(packageJson, { name: "packageJson" });
  return population;
}

function listRelativeFiles(rootDir: string, prefix = ""): string[] {
  if (!existsSync(rootDir)) {
    return [];
  }
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

describe("inspect", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("matches a known population/plan without applying", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-inspect-"));
    const repositoryRoot = tempDir;
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");
    mkdirSync(architectureDir, { recursive: true });

    const population = buildGuidePopulation();
    const result = inspect(population, {
      architectureDir,
      materializationRoot,
      repositoryRoot,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const { report } = result;
    expect(report.roots.repository).toBe(repositoryRoot);
    expect(report.roots.materialization).toBe(materializationRoot);
    expect(report.roots.architecture).toBe(architectureDir);
    expect(report.roots.repository).not.toBe(report.roots.materialization);

    expect(report.instances.map((i) => ({ id: i.id, construct: i.constructName }))).toEqual([
      { id: "pagebuilder", construct: "CorePackage" },
      { id: "page", construct: "Model" },
      { id: "pageSlug", construct: "Model" },
      { id: "resolvePage", construct: "UseCase" },
      { id: "packageJson", construct: "PackageJson" },
    ]);

    expect(report.instances.find((i) => i.id === "page")?.dependencies).toEqual({
      core: "pagebuilder",
    });

    expect(report.tree).toEqual([
      "package.json",
      "packages/core-pagebuilder",
      "packages/core-pagebuilder/models",
      "packages/core-pagebuilder/models/index.ts",
      "packages/core-pagebuilder/models/page-slug.model.ts",
      "packages/core-pagebuilder/models/page.model.ts",
      "packages/core-pagebuilder/operations",
      "packages/core-pagebuilder/operations/index.ts",
      "packages/core-pagebuilder/ports",
      "packages/core-pagebuilder/ports/index.ts",
      "packages/core-pagebuilder/use-cases",
      "packages/core-pagebuilder/use-cases/index.ts",
      "packages/core-pagebuilder/use-cases/resolve-page.use-case.ts",
    ]);

    expect(report.scaffold.map((a) => a.path).sort()).toEqual([
      "package.json",
      "packages/core-pagebuilder/models/page-slug.model.ts",
      "packages/core-pagebuilder/models/page.model.ts",
      "packages/core-pagebuilder/use-cases/resolve-page.use-case.ts",
    ]);
    expect(report.sync.map((a) => a.path).sort()).toEqual([
      "packages/core-pagebuilder/models/index.ts",
      "packages/core-pagebuilder/operations/index.ts",
      "packages/core-pagebuilder/ports/index.ts",
      "packages/core-pagebuilder/use-cases/index.ts",
    ]);

    const pageModel = report.artifacts.find(
      (a) => a.path === "packages/core-pagebuilder/models/page.model.ts"
    );
    expect(pageModel).toMatchObject({
      instanceId: "page",
      constructName: "Model",
      artifactKey: "source",
      mode: "scaffold",
      referencedDirectory: {
        instanceId: "pagebuilder",
        constructName: "CorePackage",
        artifactKey: "models",
        path: "packages/core-pagebuilder/models",
      },
    });

    expect(report.plan.length).toBeGreaterThan(0);
    expect(
      report.plan.every(
        (op) =>
          op.type === "mkdir" || op.type === "write" || op.type === "delete" || op.type === "move"
      )
    ).toBe(true);
    expect(report.wouldMutateDisk).toBe(true);
    expect(report.wouldUpdateManifest).toBe(true);
    expect(report.lastManifest).toBeUndefined();

    // No disk / manifest mutation.
    expect(listRelativeFiles(materializationRoot)).toEqual([]);
    expect(existsSync(join(architectureDir, MANIFEST_RELATIVE_PATH))).toBe(false);

    const applied = apply(population, { architectureDir, materializationRoot });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(applied.plan).toEqual(report.plan);
  });

  it("reports a no-op plan after a successful apply without rewriting anything", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-inspect-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");

    const population = buildGuidePopulation();
    const applied = apply(population, { architectureDir, materializationRoot });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }

    const beforeFiles = listRelativeFiles(materializationRoot);
    const beforeManifest = readFileSync(join(architectureDir, MANIFEST_RELATIVE_PATH), "utf8");
    const beforeMtime = statSync(join(architectureDir, MANIFEST_RELATIVE_PATH)).mtimeMs;

    const result = inspect(population, { architectureDir, materializationRoot });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.report.plan).toEqual([]);
    expect(result.report.wouldMutateDisk).toBe(false);
    expect(result.report.wouldUpdateManifest).toBe(false);
    expect(result.report.lastManifest).toEqual(readManifest(architectureDir));

    expect(listRelativeFiles(materializationRoot)).toEqual(beforeFiles);
    expect(readFileSync(join(architectureDir, MANIFEST_RELATIVE_PATH), "utf8")).toBe(
      beforeManifest
    );
    expect(statSync(join(architectureDir, MANIFEST_RELATIVE_PATH)).mtimeMs).toBe(beforeMtime);
  });

  it("surfaces validation diagnostics without writing", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-inspect-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");
    mkdirSync(architectureDir, { recursive: true });
    writeFileSync(join(architectureDir, "keep.txt"), "untouched\n", "utf8");

    const A = defineArchitecture("Broken");
    const pkg = A.defineConstruct("Pkg", () => ({
      bad: file({ filename: "../escape.ts", directory: root, mode: "scaffold", content: "nope\n" }),
    }));
    const population = createPopulation(A);
    population.add(pkg, { name: "x" });

    const result = inspect(population, { architectureDir, materializationRoot });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(existsSync(materializationRoot)).toBe(false);
    expect(existsSync(join(architectureDir, MANIFEST_RELATIVE_PATH))).toBe(false);
    expect(readFileSync(join(architectureDir, "keep.txt"), "utf8")).toBe("untouched\n");
  });
});
