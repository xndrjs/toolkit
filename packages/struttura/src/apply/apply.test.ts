import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { FileMode } from "../structure/artifacts";
import { defineStructure } from "../structure/define-structure";
import { toKebabCase } from "../casing/casing";
import { createPopulation } from "../population/create-population";
import { buildGuidePopulation } from "../test-fixtures/guide-structure";
import { apply } from "./apply";
import { MANIFEST_RELATIVE_PATH, readManifest } from "./manifest";
import { moveTempPath } from "./plan";

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
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");

    const first = apply(buildGuidePopulation(), { structureDir, materializationRoot });
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

    const manifestFile = join(structureDir, MANIFEST_RELATIVE_PATH);
    expect(existsSync(manifestFile)).toBe(true);
    expect(existsSync(join(materializationRoot, ".struttura"))).toBe(false);

    const manifest = readManifest(structureDir);
    expect(manifest).toBeDefined();
    expect(manifest?.structureName).toBe("CleanArchitecture");
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
      artifactKey: ".",
      constructName: "Model",
      mode: "scaffold",
      filename: "page.model.ts",
      directory: { kind: "artifact", instanceId: "pagebuilder", artifactKey: "models" },
    });
  });

  it("is a no-op on re-apply when inputs and disk still match", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-apply-"));
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");
    const options = { structureDir, materializationRoot };

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
    const manifestBefore = readFileSync(join(structureDir, MANIFEST_RELATIVE_PATH), "utf8");

    const second = apply(buildGuidePopulation(), options);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    expect(second.plan).toEqual([]);
    expect(second.mutated).toBe(false);
    expect(readFileSync(join(structureDir, MANIFEST_RELATIVE_PATH), "utf8")).toBe(manifestBefore);

    for (const [rel, before] of snapshot) {
      const abs = join(materializationRoot, rel);
      expect(readFileSync(abs, "utf8")).toBe(before.content);
      expect(statSync(abs).mtimeMs).toBe(before.mtimeMs);
    }
  });

  it("refuses to overwrite an unmanaged file already on disk", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-apply-"));
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");

    const A = defineStructure("Conflict");
    const thing = A.construct("Thing", {}, () =>
      A.in(A.rootDirectory, {
        packageJson: A.file("package.json", '{ "name": "managed" }\n'),
      })
    );
    const population = createPopulation(A);
    population.add(thing, { name: "root-file" });

    mkdirSync(materializationRoot, { recursive: true });
    writeFileSync(join(materializationRoot, "package.json"), '{ "name": "foreign" }\n');

    const result = apply(population, { structureDir, materializationRoot });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics.some((d) => d.message.includes("unmanaged file"))).toBe(true);
    expect(readFileSync(join(materializationRoot, "package.json"), "utf8")).toBe(
      '{ "name": "foreign" }\n'
    );
    expect(existsSync(join(structureDir, MANIFEST_RELATIVE_PATH))).toBe(false);
  });
});

function buildSingleFilePopulation(mode: FileMode, content: string) {
  const A = defineStructure("Lifecycle");
  const thing = A.construct("Thing", {}, () =>
    A.in(A.rootDirectory, A.file("thing.ts", content, { mode }))
  );
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
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");
    const options = { structureDir, materializationRoot };
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
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");
    const options = { structureDir, materializationRoot };
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
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");

    for (const mode of ["scaffold", "sync"] as const) {
      const options = {
        structureDir: join(structureDir, mode),
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
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");
    const options = { structureDir, materializationRoot };
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

    const manifest = readManifest(structureDir);
    expect(manifest?.artifacts.find((a) => a.path === "thing.ts")).toMatchObject({
      mode: "sync",
    });
  });
});

/** Compact CorePackage + Model layout matching analysis §14. */
function buildDeletesStructure() {
  const A = defineStructure("Deletes");
  const corePackage = A.construct("CorePackage", {}, ({ name }) =>
    A.in(
      A.rootDirectory,
      A.dir(`packages/core-${toKebabCase(name)}`, {
        models: A.dir({
          index: A.file("index.ts", "// models barrel\n", { mode: "sync" }),
        }),
      })
    )
  );
  const model = A.construct("Model", { core: corePackage }, ({ name, core }) =>
    A.in(
      core.models,
      A.file(`${toKebabCase(name)}.model.ts`, `export type ${name} = { id: string };\n`)
    )
  );
  return { A, corePackage, model };
}

describe("deletes and foreign files (analysis §14)", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("removing a file artifact deletes only that file and keeps unmanaged siblings", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-deletes-"));
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");
    const options = { structureDir, materializationRoot };
    const { A, corePackage, model } = buildDeletesStructure();

    const withModel = createPopulation(A);
    const pagebuilder = withModel.add(corePackage, { name: "pagebuilder" });
    withModel.add(model, { name: "page", core: pagebuilder });

    const first = apply(withModel, options);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const helpersPath = join(materializationRoot, "packages/core-pagebuilder/models/helpers.ts");
    writeFileSync(helpersPath, "export const helpers = true;\n");

    const withoutModel = createPopulation(A);
    withoutModel.add(corePackage, { name: "pagebuilder" });

    const second = apply(withoutModel, options);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    expect(second.plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "delete",
          kind: "file",
          path: "packages/core-pagebuilder/models/page.model.ts",
          instanceId: "page",
          artifactKey: ".",
        }),
      ])
    );
    expect(
      second.plan.some(
        (op) => op.type === "delete" && op.path === "packages/core-pagebuilder/models"
      )
    ).toBe(false);
    expect(
      existsSync(join(materializationRoot, "packages/core-pagebuilder/models/page.model.ts"))
    ).toBe(false);
    expect(readFileSync(helpersPath, "utf8")).toBe("export const helpers = true;\n");
    expect(existsSync(join(materializationRoot, "packages/core-pagebuilder/models"))).toBe(true);
  });

  it("removing a directory artifact deletes the full tree including foreign files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-deletes-"));
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");
    const options = { structureDir, materializationRoot };
    const { A, corePackage, model } = buildDeletesStructure();

    const withCore = createPopulation(A);
    const pagebuilder = withCore.add(corePackage, { name: "pagebuilder" });
    withCore.add(model, { name: "page", core: pagebuilder });

    const first = apply(withCore, options);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const helpersPath = join(materializationRoot, "packages/core-pagebuilder/models/helpers.ts");
    writeFileSync(helpersPath, "export const helpers = true;\n");

    const empty = createPopulation(A);
    const second = apply(empty, options);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    expect(second.plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "delete",
          kind: "directory",
          path: "packages/core-pagebuilder",
          instanceId: "pagebuilder",
          artifactKey: ".",
        }),
      ])
    );
    // Nested managed paths under the package dir are covered by the recursive delete.
    expect(
      second.plan.filter(
        (op) => op.type === "delete" && op.path.startsWith("packages/core-pagebuilder/")
      )
    ).toEqual([]);
    expect(existsSync(join(materializationRoot, "packages/core-pagebuilder"))).toBe(false);
    expect(existsSync(helpersPath)).toBe(false);
  });

  it("removing a .gitkeep deletes only that file and does not own the directory lifecycle", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-deletes-"));
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");
    const options = { structureDir, materializationRoot };

    const withKeepStruct = defineStructure("Gitkeep");
    const withKeepConstruct = withKeepStruct.construct("Folder", {}, () =>
      withKeepStruct.in(
        withKeepStruct.rootDirectory,
        withKeepStruct.dir("things", {
          keep: withKeepStruct.file(".gitkeep", ""),
        })
      )
    );
    const withKeep = createPopulation(withKeepStruct);
    withKeep.add(withKeepConstruct, { name: "things" });

    const first = apply(withKeep, options);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(existsSync(join(materializationRoot, "things/.gitkeep"))).toBe(true);
    expect(existsSync(join(materializationRoot, "things"))).toBe(true);

    // Same instance/directory identity, but the .gitkeep file artifact is gone.
    const dirOnlyStruct = defineStructure("Gitkeep");
    const dirOnlyConstruct = dirOnlyStruct.construct("Folder", {}, () =>
      dirOnlyStruct.in(dirOnlyStruct.rootDirectory, dirOnlyStruct.dir("things", {}))
    );
    const dirOnly = createPopulation(dirOnlyStruct);
    dirOnly.add(dirOnlyConstruct, { name: "things" });

    const second = apply(dirOnly, options);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    expect(second.plan).toEqual([
      expect.objectContaining({
        type: "delete",
        kind: "file",
        path: "things/.gitkeep",
        artifactKey: "keep",
      }),
    ]);
    expect(existsSync(join(materializationRoot, "things/.gitkeep"))).toBe(false);
    expect(existsSync(join(materializationRoot, "things"))).toBe(true);
    expect(second.plan.some((op) => op.type === "delete" && op.kind === "directory")).toBe(false);
  });
});

/** Compact layout for rename / directory-move scenarios (analysis §13, §15). */
function buildRenameStructure() {
  const A = defineStructure("Rename");
  const corePackage = A.construct("CorePackage", {}, ({ name }) =>
    A.in(
      A.rootDirectory,
      A.dir(`packages/core-${toKebabCase(name)}`, {
        models: A.dir({
          index: A.file("index.ts", "// models barrel\n", { mode: "sync" }),
        }),
      })
    )
  );
  const model = A.construct("Model", { core: corePackage }, ({ name, core }) =>
    A.in(
      core.models,
      A.file(`${toKebabCase(name)}.model.ts`, `export type ${name} = { id: string };\n`)
    )
  );
  return { A, corePackage, model };
}

describe("rename/move and interrupt recovery (analysis §13, §15)", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("stable-id rename moves the scaffold file and preserves authored content", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-rename-"));
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");
    const options = { structureDir, materializationRoot };
    const { A, corePackage, model } = buildRenameStructure();

    const initial = createPopulation(A);
    const pagebuilder = initial.add(corePackage, { name: "pagebuilder" });
    initial.add(model, { name: "page", core: pagebuilder });

    const first = apply(initial, options);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const oldPath = join(materializationRoot, "packages/core-pagebuilder/models/page.model.ts");
    const authored = "export type page = { id: string; authored: true };\n";
    writeFileSync(oldPath, authored);

    const renamed = createPopulation(A);
    const core = renamed.add(corePackage, { name: "pagebuilder" });
    renamed.add(model, { id: "page", name: "editorialPage", core });

    const second = apply(renamed, options);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    const newPath = "packages/core-pagebuilder/models/editorial-page.model.ts";
    expect(second.plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "move",
          kind: "file",
          from: "packages/core-pagebuilder/models/page.model.ts",
          to: newPath,
          instanceId: "page",
          artifactKey: ".",
        }),
      ])
    );
    expect(existsSync(oldPath)).toBe(false);
    expect(readFileSync(join(materializationRoot, newPath), "utf8")).toBe(authored);
  });

  it("directory artifact path change moves the full tree including untracked files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-dir-move-"));
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");
    const options = { structureDir, materializationRoot };
    const { A, corePackage, model } = buildRenameStructure();

    const initial = createPopulation(A);
    const pagebuilder = initial.add(corePackage, { name: "pagebuilder" });
    initial.add(model, { name: "page", core: pagebuilder });

    const first = apply(initial, options);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const helpersPath = join(materializationRoot, "packages/core-pagebuilder/models/helpers.ts");
    writeFileSync(helpersPath, "export const helpers = true;\n");

    const renamed = createPopulation(A);
    // Keep instance id so the package directory artifact identity is stable.
    const core = renamed.add(corePackage, { id: "pagebuilder", name: "editorial" });
    renamed.add(model, { name: "page", core });

    const second = apply(renamed, options);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    expect(second.plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "move",
          kind: "directory",
          from: "packages/core-pagebuilder",
          to: "packages/core-editorial",
          instanceId: "pagebuilder",
          artifactKey: ".",
        }),
      ])
    );
    // Nested managed paths must not be moved a second time.
    expect(
      second.plan.filter(
        (op) =>
          op.type === "move" &&
          op.from !== "packages/core-pagebuilder" &&
          (op.from.startsWith("packages/core-pagebuilder/") ||
            op.from.startsWith("packages/core-editorial/"))
      )
    ).toEqual([]);

    expect(existsSync(join(materializationRoot, "packages/core-pagebuilder"))).toBe(false);
    expect(
      readFileSync(
        join(materializationRoot, "packages/core-editorial/models/page.model.ts"),
        "utf8"
      )
    ).toBe("export type page = { id: string };\n");
    expect(
      readFileSync(join(materializationRoot, "packages/core-editorial/models/helpers.ts"), "utf8")
    ).toBe("export const helpers = true;\n");
  });

  it("plans crossed file destinations without losing contents", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-cross-"));
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");
    const options = { structureDir, materializationRoot };

    const A = defineStructure("Cross");
    const thing = A.construct("Thing", {}, ({ name }) =>
      A.in(A.rootDirectory, A.file(`${toKebabCase(name)}.ts`, `export const ${name} = 1;\n`))
    );

    const initial = createPopulation(A);
    initial.add(thing, { id: "alpha", name: "alpha" });
    initial.add(thing, { id: "beta", name: "beta" });

    const first = apply(initial, options);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    writeFileSync(join(materializationRoot, "alpha.ts"), "export const alpha = 'authored';\n");
    writeFileSync(join(materializationRoot, "beta.ts"), "export const beta = 'authored';\n");

    // Swap filenames while keeping stable ids → crossed destinations.
    const swapped = createPopulation(A);
    swapped.add(thing, { id: "alpha", name: "beta" });
    swapped.add(thing, { id: "beta", name: "alpha" });

    const second = apply(swapped, options);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    const moveOps = second.plan.filter((op) => op.type === "move");
    expect(moveOps.length).toBeGreaterThanOrEqual(2);
    expect(moveOps.some((op) => op.type === "move" && op.from.includes(".struttura-tmp/"))).toBe(
      true
    );

    expect(readFileSync(join(materializationRoot, "beta.ts"), "utf8")).toBe(
      "export const alpha = 'authored';\n"
    );
    expect(readFileSync(join(materializationRoot, "alpha.ts"), "utf8")).toBe(
      "export const beta = 'authored';\n"
    );
    expect(existsSync(join(materializationRoot, ".struttura-tmp"))).toBe(false);

    const manifest = readManifest(structureDir);
    expect(manifest?.artifacts.find((a) => a.instanceId === "alpha")?.path).toBe("beta.ts");
    expect(manifest?.artifacts.find((a) => a.instanceId === "beta")?.path).toBe("alpha.ts");
  });

  it("recovers from an interrupted move by idempotent replan (ADR 0006)", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-recovery-"));
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");
    const options = { structureDir, materializationRoot };
    const { A, corePackage, model } = buildRenameStructure();

    const initial = createPopulation(A);
    const pagebuilder = initial.add(corePackage, { name: "pagebuilder" });
    initial.add(model, { name: "page", core: pagebuilder });

    const first = apply(initial, options);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const authored = "export type page = { id: string; recovered: true };\n";
    writeFileSync(
      join(materializationRoot, "packages/core-pagebuilder/models/page.model.ts"),
      authored
    );

    const renamed = createPopulation(A);
    const core = renamed.add(corePackage, { name: "pagebuilder" });
    renamed.add(model, { id: "page", name: "editorialPage", core });

    // Simulate interrupt after the file was already relocated but before the
    // success manifest was rewritten (last good manifest still points at the old path).
    const oldRel = "packages/core-pagebuilder/models/page.model.ts";
    const newRel = "packages/core-pagebuilder/models/editorial-page.model.ts";
    mkdirSync(join(materializationRoot, "packages/core-pagebuilder/models"), { recursive: true });
    renameSync(join(materializationRoot, oldRel), join(materializationRoot, newRel));
    expect(existsSync(join(materializationRoot, oldRel))).toBe(false);
    expect(readFileSync(join(materializationRoot, newRel), "utf8")).toBe(authored);

    const manifestBefore = readFileSync(join(structureDir, MANIFEST_RELATIVE_PATH), "utf8");
    expect(manifestBefore).toContain(oldRel);

    const recovered = apply(renamed, options);
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) {
      return;
    }

    expect(recovered.plan.some((op) => op.type === "move")).toBe(false);
    expect(readFileSync(join(materializationRoot, newRel), "utf8")).toBe(authored);
    expect(existsSync(join(materializationRoot, oldRel))).toBe(false);

    const manifest = readManifest(structureDir);
    expect(
      manifest?.artifacts.find((a) => a.instanceId === "page" && a.artifactKey === ".")
    ).toMatchObject({
      path: newRel,
    });

    const third = apply(renamed, options);
    expect(third.ok).toBe(true);
    if (!third.ok) {
      return;
    }
    expect(third.plan).toEqual([]);
    expect(third.mutated).toBe(false);
  });

  it("recovers from an interrupt mid-staging via deterministic temp paths", () => {
    tempDir = mkdtempSync(join(tmpdir(), "struttura-temp-recovery-"));
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");
    const options = { structureDir, materializationRoot };

    const A = defineStructure("TempRecovery");
    const thing = A.construct("Thing", {}, ({ name }) =>
      A.in(A.rootDirectory, A.file(`${toKebabCase(name)}.ts`, `export const ${name} = 1;\n`))
    );

    const initial = createPopulation(A);
    initial.add(thing, { id: "alpha", name: "alpha" });
    initial.add(thing, { id: "beta", name: "beta" });
    expect(apply(initial, options).ok).toBe(true);

    writeFileSync(join(materializationRoot, "alpha.ts"), "export const alpha = 'A';\n");
    writeFileSync(join(materializationRoot, "beta.ts"), "export const beta = 'B';\n");

    // Interrupt after alpha was staged to its deterministic temp (crossed swap).
    const alphaTemp = moveTempPath("alpha::.");
    mkdirSync(join(materializationRoot, ".struttura-tmp"), { recursive: true });
    renameSync(join(materializationRoot, "alpha.ts"), join(materializationRoot, alphaTemp));

    const swapped = createPopulation(A);
    swapped.add(thing, { id: "alpha", name: "beta" });
    swapped.add(thing, { id: "beta", name: "alpha" });

    const recovered = apply(swapped, options);
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) {
      return;
    }

    expect(readFileSync(join(materializationRoot, "beta.ts"), "utf8")).toBe(
      "export const alpha = 'A';\n"
    );
    expect(readFileSync(join(materializationRoot, "alpha.ts"), "utf8")).toBe(
      "export const beta = 'B';\n"
    );
    expect(existsSync(join(materializationRoot, ".struttura-tmp"))).toBe(false);
  });
});
