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

import { defineStructure } from "../structure/define-structure";
import { createPopulation } from "../population/create-population";
import { apply } from "../apply/apply";
import { MANIFEST_RELATIVE_PATH, readManifest } from "../apply/manifest";
import { buildGuidePopulation } from "../test-fixtures/guide-structure";
import { inspect } from "./inspect";

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
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");
    mkdirSync(structureDir, { recursive: true });

    const population = buildGuidePopulation();
    const result = inspect(population, {
      structureDir,
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
    expect(report.roots.structure).toBe(structureDir);
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
      artifactKey: ".",
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
    expect(existsSync(join(structureDir, MANIFEST_RELATIVE_PATH))).toBe(false);

    const applied = apply(population, { structureDir, materializationRoot });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(applied.plan).toEqual(report.plan);
  });

  it("reports a no-op plan after a successful apply without rewriting anything", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-inspect-"));
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");

    const population = buildGuidePopulation();
    const applied = apply(population, { structureDir, materializationRoot });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }

    const beforeFiles = listRelativeFiles(materializationRoot);
    const beforeManifest = readFileSync(join(structureDir, MANIFEST_RELATIVE_PATH), "utf8");
    const beforeMtime = statSync(join(structureDir, MANIFEST_RELATIVE_PATH)).mtimeMs;

    const result = inspect(population, { structureDir, materializationRoot });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.report.plan).toEqual([]);
    expect(result.report.wouldMutateDisk).toBe(false);
    expect(result.report.wouldUpdateManifest).toBe(false);
    expect(result.report.lastManifest).toEqual(readManifest(structureDir));

    expect(listRelativeFiles(materializationRoot)).toEqual(beforeFiles);
    expect(readFileSync(join(structureDir, MANIFEST_RELATIVE_PATH), "utf8")).toBe(beforeManifest);
    expect(statSync(join(structureDir, MANIFEST_RELATIVE_PATH)).mtimeMs).toBe(beforeMtime);
  });

  it("surfaces validation diagnostics without writing", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-inspect-"));
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");
    mkdirSync(structureDir, { recursive: true });
    writeFileSync(join(structureDir, "keep.txt"), "untouched\n", "utf8");

    const A = defineStructure("Broken");
    const pkg = A.construct("Pkg", {}, () =>
      A.in(A.rootDirectory, A.file("../escape.ts", "nope\n"))
    );
    const population = createPopulation(A);
    population.add(pkg, { name: "x" });

    const result = inspect(population, { structureDir, materializationRoot });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(existsSync(materializationRoot)).toBe(false);
    expect(existsSync(join(structureDir, MANIFEST_RELATIVE_PATH))).toBe(false);
    expect(readFileSync(join(structureDir, "keep.txt"), "utf8")).toBe("untouched\n");
  });
});
