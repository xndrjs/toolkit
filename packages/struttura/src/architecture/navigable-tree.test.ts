import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { apply } from "../apply/apply";
import { toKebabCase } from "../casing/casing";
import { deriveDesiredInventory } from "../inventory/derive-desired-inventory";
import { createPopulation } from "../population/create-population";
import { defineArchitecture } from "./define-architecture";

describe("navigable tree (ticket 01 minimal)", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("derives inventory with '.' root key and child keys, seals navigable instance", () => {
    const A = defineArchitecture("MinimalTree");
    const CorePackage = A.construct("CorePackage", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`packages/core-${toKebabCase(name)}`, {
          packageJson: A.file("package.json", '{ "name": "core" }\n'),
          readme: A.file("README.md", "# core\n"),
        })
      )
    );

    const population = createPopulation(A);
    const core = population.add(CorePackage, { name: "pagebuilder" });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(
      result.inventory.artifacts.map((a) => ({
        key: a.artifactKey,
        kind: a.kind,
        path: a.path,
      }))
    ).toEqual([
      {
        key: ".",
        kind: "directory",
        path: "packages/core-pagebuilder",
      },
      {
        key: "readme",
        kind: "file",
        path: "packages/core-pagebuilder/README.md",
      },
      {
        key: "packageJson",
        kind: "file",
        path: "packages/core-pagebuilder/package.json",
      },
    ]);

    const packageJson = result.inventory.artifacts.find((a) => a.artifactKey === "packageJson");
    expect(packageJson).toMatchObject({
      instanceId: "pagebuilder",
      constructName: "CorePackage",
      mode: "scaffold",
      filename: "package.json",
      directory: { kind: "artifact", instanceId: "pagebuilder", artifactKey: "." },
    });

    // Navigable instance: reserved + children; no enumerable .artifacts / destination string
    const navigable = core as unknown as {
      name: string;
      id: string;
      construct: typeof CorePackage;
      path: string;
      packageJson: { path: string };
      readme: { path: string };
    };
    expect(navigable.name).toBe("pagebuilder");
    expect(navigable.id).toBe("pagebuilder");
    expect(navigable.construct).toBe(CorePackage);
    expect(navigable.path).toBe("packages/core-pagebuilder");
    expect(navigable.packageJson.path).toBe("packages/core-pagebuilder/package.json");
    expect(navigable.readme.path).toBe("packages/core-pagebuilder/README.md");

    const enumerableKeys = Object.keys(core);
    expect(enumerableKeys).toContain("packageJson");
    expect(enumerableKeys).toContain("readme");
    expect(enumerableKeys).toContain("path");
    expect(enumerableKeys).toContain("name");
    expect(enumerableKeys).not.toContain("artifacts");
    expect(enumerableKeys).not.toContain("destination");
    expect("artifacts" in core).toBe(true); // non-enumerable engine slot

    expect(A.destination(core)).toBe(A.rootDirectory);
    expect(A.destination(core).kind).toBe("root");
  });

  it("reports reserved-key-collision when a child uses a reserved top-level name", () => {
    const A = defineArchitecture("ReservedCollision");
    const Bad = A.construct("Bad", {}, () =>
      A.in(
        A.rootDirectory,
        A.dir("pkg", {
          name: A.file("name.txt", "x\n"),
        })
      )
    );

    const population = createPopulation(A);
    population.add(Bad, { name: "bad" });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "reserved-key-collision",
        artifactKey: "name",
        constructName: "Bad",
        instanceId: "bad",
      }),
    ]);
  });

  it("applies scaffold files from a tree construct with the existing engine", () => {
    const A = defineArchitecture("MinimalApply");
    const CorePackage = A.construct("CorePackage", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`packages/core-${toKebabCase(name)}`, {
          packageJson: A.file("package.json", '{ "name": "pagebuilder" }\n'),
          readme: A.file("README.md", "# pagebuilder\n"),
        })
      )
    );

    const population = createPopulation(A);
    population.add(CorePackage, { name: "pagebuilder" });

    tempDir = mkdtempSync(join(tmpdir(), "struttura-tree-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");

    const first = apply(population, { architectureDir, materializationRoot });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    expect(existsSync(join(materializationRoot, "packages/core-pagebuilder"))).toBe(true);
    expect(
      readFileSync(join(materializationRoot, "packages/core-pagebuilder/package.json"), "utf8")
    ).toBe('{ "name": "pagebuilder" }\n');
    expect(
      readFileSync(join(materializationRoot, "packages/core-pagebuilder/README.md"), "utf8")
    ).toBe("# pagebuilder\n");

    // Scaffold: second apply preserves authored edits
    const pkgPath = join(materializationRoot, "packages/core-pagebuilder/package.json");
    writeFileSync(pkgPath, '{ "name": "authored" }\n');

    const second = apply(population, { architectureDir, materializationRoot });
    expect(second.ok).toBe(true);
    expect(readFileSync(pkgPath, "utf8")).toBe('{ "name": "authored" }\n');
    expect(readdirSync(join(materializationRoot, "packages/core-pagebuilder")).sort()).toEqual([
      "README.md",
      "package.json",
    ]);
  });
});

describe("navigable tree (ticket 02 peer root / nesting)", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("peer-root WorkspaceRoot: sibling keys, no '.' directory, Destination forwards", () => {
    const A = defineArchitecture("PeerRootWorkspace");
    const WorkspaceRoot = A.construct("WorkspaceRoot", {}, () =>
      A.in(A.rootDirectory, {
        packageJson: A.file("package.json", '{ "name": "workspace" }\n'),
        pnpmWorkspace: A.file("pnpm-workspace.yaml", "packages:\n  - packages/*\n"),
        tsconfig: A.file("tsconfig.json", '{ "files": [] }\n', { mode: "scaffold" }),
      })
    );

    const population = createPopulation(A);
    const workspace = population.add(WorkspaceRoot, { name: "workspace" });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.inventory.artifacts.map((a) => a.artifactKey).sort()).toEqual([
      "packageJson",
      "pnpmWorkspace",
      "tsconfig",
    ]);
    expect(result.inventory.artifacts.every((a) => a.kind === "file")).toBe(true);
    expect(result.inventory.artifacts.find((a) => a.artifactKey === "packageJson")).toMatchObject({
      path: "package.json",
      directory: { kind: "root" },
    });

    const navigable = workspace as unknown as {
      kind: string;
      path: string;
      packageJson: { path: string };
      pnpmWorkspace: { path: string };
      tsconfig: { path: string };
    };
    expect(navigable.kind).toBe("root");
    expect(navigable.path).toBe("");
    expect(navigable.packageJson.path).toBe("package.json");
    expect(navigable.pnpmWorkspace.path).toBe("pnpm-workspace.yaml");
    expect(navigable.tsconfig.path).toBe("tsconfig.json");
    expect(Object.keys(workspace)).not.toContain("artifacts");
    expect(A.destination(workspace)).toBe(A.rootDirectory);
  });

  it("nested dirs + physical name override + empty DirRef (App.composition shape)", () => {
    const A = defineArchitecture("NestingApp");
    const App = A.construct("App", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`apps/${toKebabCase(name)}`, {
          composition: A.dir({}),
          packageJson: A.file("package.json", '{ "name": "web" }\n'),
          useCases: A.dir("use-cases", {
            index: A.file("index.ts", "export {};\n"),
          }),
        })
      )
    );

    const population = createPopulation(A);
    const app = population.add(App, { name: "web" });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(
      result.inventory.artifacts.map((a) => ({
        key: a.artifactKey,
        kind: a.kind,
        path: a.path,
      }))
    ).toEqual([
      { key: ".", kind: "directory", path: "apps/web" },
      { key: "composition", kind: "directory", path: "apps/web/composition" },
      { key: "packageJson", kind: "file", path: "apps/web/package.json" },
      { key: "useCases", kind: "directory", path: "apps/web/use-cases" },
      { key: "useCases.index", kind: "file", path: "apps/web/use-cases/index.ts" },
    ]);

    // Intermediate path segment "apps" is not an owned directory artifact
    expect(result.inventory.artifacts.some((a) => a.path === "apps")).toBe(false);

    const navigable = app as unknown as {
      path: string;
      composition: { kind: string; path: string; artifactKey: string };
      useCases: { path: string; index: { path: string } };
      packageJson: { path: string };
    };
    expect(navigable.path).toBe("apps/web");
    expect(navigable.composition).toMatchObject({
      kind: "directory",
      path: "apps/web/composition",
      artifactKey: "composition",
    });
    expect(navigable.useCases.path).toBe("apps/web/use-cases");
    expect(navigable.useCases.index.path).toBe("apps/web/use-cases/index.ts");
    expect(navigable.packageJson.path).toBe("apps/web/package.json");
    expect(A.destination(app)).toBe(A.rootDirectory);
  });

  it("applies peer-root and nested empty-dir structure with the existing engine", () => {
    const A = defineArchitecture("PeerNestApply");
    const WorkspaceRoot = A.construct("WorkspaceRoot", {}, () =>
      A.in(A.rootDirectory, {
        packageJson: A.file("package.json", '{ "private": true }\n'),
      })
    );
    const App = A.construct("App", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`apps/${toKebabCase(name)}`, {
          composition: A.dir({}),
          packageJson: A.file("package.json", '{ "name": "web" }\n'),
        })
      )
    );

    const population = createPopulation(A);
    population.add(WorkspaceRoot, { name: "workspace" });
    population.add(App, { name: "web" });

    tempDir = mkdtempSync(join(tmpdir(), "struttura-tree-02-"));
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");

    const applied = apply(population, { architectureDir, materializationRoot });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }

    expect(readFileSync(join(materializationRoot, "package.json"), "utf8")).toBe(
      '{ "private": true }\n'
    );
    expect(existsSync(join(materializationRoot, "apps/web/composition"))).toBe(true);
    expect(readFileSync(join(materializationRoot, "apps/web/package.json"), "utf8")).toBe(
      '{ "name": "web" }\n'
    );
  });

  it("reports reserved-key-collision on peer-root sibling keys", () => {
    const A = defineArchitecture("PeerReserved");
    const Bad = A.construct("Bad", {}, () =>
      A.in(A.rootDirectory, {
        path: A.file("path.txt", "x\n"),
      })
    );

    const population = createPopulation(A);
    population.add(Bad, { name: "bad" });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "reserved-key-collision",
        artifactKey: "path",
        constructName: "Bad",
      }),
    ]);
  });
});
