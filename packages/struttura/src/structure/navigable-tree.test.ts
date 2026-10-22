import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { apply } from "../apply/apply";
import { toKebabCase } from "../casing/casing";
import { deriveDesiredInventory } from "../inventory/derive-desired-inventory";
import { createPopulation } from "../population/create-population";
import { defineStructure } from "./define-structure";

describe("navigable tree (ticket 01 minimal)", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("derives inventory with '.' root key and child keys, seals navigable instance", () => {
    const A = defineStructure("MinimalTree");
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
    const A = defineStructure("ReservedCollision");
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
    const A = defineStructure("MinimalApply");
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
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");

    const first = apply(population, { structureDir, materializationRoot });
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

    const second = apply(population, { structureDir, materializationRoot });
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
    const A = defineStructure("PeerRootWorkspace");
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
    const A = defineStructure("NestingApp");
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
    const A = defineStructure("PeerNestApply");
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
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");

    const applied = apply(population, { structureDir, materializationRoot });
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
    const A = defineStructure("PeerReserved");
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

describe("navigable tree (ticket 03 cross-instance / file root / provenance)", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("ModelsModule under CorePackage: paths from destination DirRef, module owns directory", () => {
    const A = defineStructure("ModelsUnderCore");
    const CorePackage = A.construct("CorePackage", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`packages/core-${toKebabCase(name)}`, {
          packageJson: A.file("package.json", '{ "name": "core" }\n'),
        })
      )
    );
    const ModelsModule = A.construct("ModelsModule", { core: CorePackage }, ({ core }) =>
      A.in(
        core,
        A.dir("models", {
          index: A.file("index.ts", "export {};\n"),
        })
      )
    );

    const population = createPopulation(A);
    const core = population.add(CorePackage, { name: "pagebuilder" });
    const models = population.add(ModelsModule, {
      id: "pagebuilder-models",
      name: "models",
      core,
    });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(
      result.inventory.artifacts
        .filter((a) => a.instanceId === "pagebuilder-models")
        .map((a) => ({
          key: a.artifactKey,
          kind: a.kind,
          path: a.path,
          construct: a.constructName,
        }))
    ).toEqual([
      {
        key: ".",
        kind: "directory",
        path: "packages/core-pagebuilder/models",
        construct: "ModelsModule",
      },
      {
        key: "index",
        kind: "file",
        path: "packages/core-pagebuilder/models/index.ts",
        construct: "ModelsModule",
      },
    ]);

    const navigable = models as unknown as {
      path: string;
      kind: string;
      index: { path: string };
    };
    expect(navigable.path).toBe("packages/core-pagebuilder/models");
    expect(navigable.kind).toBe("directory");
    expect(navigable.index.path).toBe("packages/core-pagebuilder/models/index.ts");
    expect(A.destination(models)).toBe(core);
  });

  it("Shape file-root under ModelsModule: FileRef instance, Destination = models", () => {
    const A = defineStructure("ShapeInModels");
    const CorePackage = A.construct("CorePackage", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`packages/core-${toKebabCase(name)}`, {
          packageJson: A.file("package.json", "{}\n"),
        })
      )
    );
    const ModelsModule = A.construct("ModelsModule", { core: CorePackage }, ({ core }) =>
      A.in(
        core,
        A.dir("models", {
          index: A.file("index.ts", "export {};\n"),
        })
      )
    );
    const Shape = A.construct("Shape", { models: ModelsModule }, ({ name, models }) =>
      A.in(models, A.file(`${toKebabCase(name)}.shape.ts`, `export type ${name} = {};\n`))
    );

    const population = createPopulation(A);
    const core = population.add(CorePackage, { name: "pagebuilder" });
    const models = population.add(ModelsModule, {
      id: "pagebuilder-models",
      name: "models",
      core,
    });
    const page = population.add(Shape, { name: "page", models });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const shapeArtifact = result.inventory.artifacts.find(
      (a) => a.instanceId === "page" && a.artifactKey === "."
    );
    expect(shapeArtifact).toMatchObject({
      kind: "file",
      path: "packages/core-pagebuilder/models/page.shape.ts",
      constructName: "Shape",
      filename: "page.shape.ts",
      directory: {
        kind: "artifact",
        instanceId: "pagebuilder-models",
        artifactKey: ".",
      },
    });

    const navigable = page as unknown as {
      kind: string;
      path: string;
      filename: string;
      name: string;
      id: string;
    };
    expect(navigable.kind).toBe("file");
    expect(navigable.path).toBe("packages/core-pagebuilder/models/page.shape.ts");
    expect(navigable.filename).toBe("page.shape.ts");
    expect(navigable.name).toBe("page");
    expect(navigable.id).toBe("page");
    expect(Object.keys(page)).not.toContain("artifacts");
    expect(A.destination(page)).toBe(models);
  });

  it("Repository under Adapter.repositories: Adapter owns dir, Repository owns file", () => {
    const A = defineStructure("RepoUnderAdapter");
    const AdapterPackage = A.construct("AdapterPackage", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`packages/adapter-${toKebabCase(name)}`, {
          repositories: A.dir({
            index: A.file("index.ts", "export {};\n"),
          }),
          packageJson: A.file("package.json", "{}\n"),
        })
      )
    );
    const Repository = A.construct("Repository", { adapter: AdapterPackage }, ({ name, adapter }) =>
      A.in(
        adapter.repositories,
        A.file(`${toKebabCase(name)}.repository.ts`, `export class ${name} {}\n`)
      )
    );

    const population = createPopulation(A);
    const adapter = population.add(AdapterPackage, { name: "contentful-pagebuilder" });
    population.add(Repository, {
      id: "page-repository",
      name: "pageRepository",
      adapter,
    });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const repositoriesDir = result.inventory.artifacts.find(
      (a) => a.artifactKey === "repositories" && a.kind === "directory"
    );
    expect(repositoriesDir).toMatchObject({
      instanceId: "contentful-pagebuilder",
      constructName: "AdapterPackage",
      path: "packages/adapter-contentful-pagebuilder/repositories",
    });

    const repoFile = result.inventory.artifacts.find(
      (a) => a.instanceId === "page-repository" && a.artifactKey === "."
    );
    expect(repoFile).toMatchObject({
      kind: "file",
      constructName: "Repository",
      path: "packages/adapter-contentful-pagebuilder/repositories/page-repository.repository.ts",
      directory: {
        kind: "artifact",
        instanceId: "contentful-pagebuilder",
        artifactKey: "repositories",
      },
    });

    // Provenance: placement under Adapter.repositories does not transfer directory ownership
    expect(
      result.inventory.artifacts.filter(
        (a) => a.path === "packages/adapter-contentful-pagebuilder/repositories"
      )
    ).toHaveLength(1);
    expect(repositoriesDir?.instanceId).toBe("contentful-pagebuilder");
  });

  it("rejects file-root instance as A.in destination", () => {
    const A = defineStructure("FileAsDest");
    const Host = A.construct("Host", {}, () =>
      A.in(A.rootDirectory, A.dir("pkg", { keep: A.file(".gitkeep", "") }))
    );
    const FileRoot = A.construct("FileRoot", { host: Host }, ({ host }) =>
      A.in(host, A.file("alone.ts", "export {};\n"))
    );
    // Runtime-only: FileRef is not a PlacementDestination (types reject without cast).
    const Bad = A.construct("Bad", { fileRoot: FileRoot }, ({ fileRoot }) =>
      A.in(fileRoot as unknown as typeof A.rootDirectory, A.dir("nested", {}))
    );

    const population = createPopulation(A);
    const host = population.add(Host, { name: "host" });
    const fileRoot = population.add(FileRoot, { name: "alone", host });
    population.add(Bad, { name: "bad", fileRoot });

    const result = deriveDesiredInventory(population);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "file-ref-as-directory",
        constructName: "Bad",
        instanceId: "bad",
        path: "pkg/alone.ts",
      }),
    ]);
  });

  it("applies ModelsModule + Shape + Repository provenance layout", () => {
    const A = defineStructure("CrossApply");
    const CorePackage = A.construct("CorePackage", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`packages/core-${toKebabCase(name)}`, {
          packageJson: A.file("package.json", "{}\n"),
        })
      )
    );
    const ModelsModule = A.construct("ModelsModule", { core: CorePackage }, ({ core }) =>
      A.in(core, A.dir("models", { index: A.file("index.ts", "export {};\n") }))
    );
    const Shape = A.construct("Shape", { models: ModelsModule }, ({ name, models }) =>
      A.in(models, A.file(`${toKebabCase(name)}.shape.ts`, `export type ${name} = {};\n`))
    );
    const AdapterPackage = A.construct("AdapterPackage", {}, ({ name }) =>
      A.in(
        A.rootDirectory,
        A.dir(`packages/adapter-${toKebabCase(name)}`, {
          repositories: A.dir({
            index: A.file("index.ts", "export {};\n"),
          }),
        })
      )
    );
    const Repository = A.construct("Repository", { adapter: AdapterPackage }, ({ name, adapter }) =>
      A.in(adapter.repositories, A.file(`${toKebabCase(name)}.repository.ts`, "// repo\n"))
    );

    const population = createPopulation(A);
    const core = population.add(CorePackage, { name: "pagebuilder" });
    const models = population.add(ModelsModule, {
      id: "pagebuilder-models",
      name: "models",
      core,
    });
    population.add(Shape, { name: "page", models });
    const adapter = population.add(AdapterPackage, { name: "contentful-pagebuilder" });
    population.add(Repository, {
      id: "page-repository",
      name: "pageRepository",
      adapter,
    });

    tempDir = mkdtempSync(join(tmpdir(), "struttura-tree-03-"));
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");

    const applied = apply(population, { structureDir, materializationRoot });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }

    expect(
      readFileSync(join(materializationRoot, "packages/core-pagebuilder/models/index.ts"), "utf8")
    ).toBe("export {};\n");
    expect(
      readFileSync(
        join(materializationRoot, "packages/core-pagebuilder/models/page.shape.ts"),
        "utf8"
      )
    ).toBe("export type page = {};\n");
    expect(
      readFileSync(
        join(
          materializationRoot,
          "packages/adapter-contentful-pagebuilder/repositories/page-repository.repository.ts"
        ),
        "utf8"
      )
    ).toBe("// repo\n");
    expect(
      existsSync(join(materializationRoot, "packages/adapter-contentful-pagebuilder/repositories"))
    ).toBe(true);
  });
});
