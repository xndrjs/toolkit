import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  defineArchitecture,
  dir,
  file,
  root,
  type DirRef,
  type FileRef,
  type InstanceRef,
  type PlacementDestination,
} from "../architecture/define-architecture";
import { toKebabCase } from "../casing/casing";
import { createPopulation } from "../population/create-population";
import { apply } from "../apply/apply";
import { inspect } from "../inspect/inspect";
import {
  computeDefinitionStamp,
  constructsFromArchitecture,
  emitPopulateApi,
  navigableShapeFromKinds,
  probeArtifactKinds,
  probeNavigableShapes,
} from "./emit-populate-api";

function buildCleanArchitecture() {
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

  const architecture = A.seal();
  return {
    A,
    architecture,
    constructs: {
      CorePackage: corePackage,
      Model: model,
      PackageJson: packageJson,
    },
  };
}

describe("codegen + staleness", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("probes artifact keys and Dir vs File kinds from the architecture declaration", () => {
    const { architecture } = buildCleanArchitecture();
    const kinds = probeArtifactKinds(architecture);

    expect(kinds.get("CorePackage")).toEqual({
      packageDirectory: "directory",
      models: "directory",
      modelsIndex: "file",
    });
    expect(kinds.get("Model")).toEqual({ source: "file" });
    expect(kinds.get("PackageJson")).toEqual({ packageJson: "file" });
  });

  it("embeds a definition stamp that changes when the architecture changes", () => {
    const { architecture, A, constructs } = buildCleanArchitecture();
    const stamp = computeDefinitionStamp(architecture);
    expect(stamp).toMatch(/^[a-f0-9]{64}$/);
    expect(computeDefinitionStamp(architecture)).toBe(stamp);

    A.defineConstruct("Extra", () => ({ folder: dir("extra") }));
    expect(computeDefinitionStamp(A.seal())).not.toBe(stamp);
    expect(constructsFromArchitecture(architecture).CorePackage).toBe(constructs.CorePackage);
  });

  it("emits typed populate factories that drive population via the runtime collector", () => {
    const { architecture, constructs } = buildCleanArchitecture();
    const { source, stamp } = emitPopulateApi(architecture, {
      architectureModule: "../architecture",
    });

    expect(stamp).toBe(computeDefinitionStamp(architecture));
    expect(source).toContain(`export const DEFINITION_STAMP = "${stamp}"`);
    expect(source).toContain("export function createPopulateApi()");
    expect(source).toContain("CorePackage(input: { name: string; id?: string })");
    expect(source).toContain("Model(input: { name: string; id?: string; core: CorePackageRef })");
    expect(source).toContain("readonly models: DirRef");
    expect(source).toContain("readonly source: FileRef");
    expect(source).toContain('readonly __constructBrand: "CorePackage"');
    expect(source).toContain(
      "createPopulation(architecture, { definitionStamp: DEFINITION_STAMP })"
    );

    // Runtime mirror of the generated API: factories register into one population.
    const population = createPopulation(architecture, { definitionStamp: stamp });
    const pagebuilder = population.add(constructs.CorePackage, { name: "pagebuilder" });
    population.add(constructs.Model, { name: "page", core: pagebuilder });
    population.add(constructs.PackageJson, { name: "packageJson" });

    tempDir = mkdtempSync(join(tmpdir(), "struttura-codegen-"));
    const result = apply(population, {
      architectureDir: join(tempDir, "architecture"),
      materializationRoot: join(tempDir, "project"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(readFileSync(join(tempDir, "project/package.json"), "utf8")).toBe(
      '{ "name": "project" }\n'
    );
  });

  it("apply and inspect fail closed when the definition stamp is stale", () => {
    const { architecture, constructs } = buildCleanArchitecture();
    const population = createPopulation(architecture, { definitionStamp: "stale-stamp" });
    population.add(constructs.PackageJson, { name: "packageJson" });

    tempDir = mkdtempSync(join(tmpdir(), "struttura-stale-"));
    const options = {
      architectureDir: join(tempDir, "architecture"),
      materializationRoot: join(tempDir, "project"),
    };

    const applied = apply(population, options);
    expect(applied.ok).toBe(false);
    if (applied.ok) {
      return;
    }
    expect(applied.diagnostics).toEqual([
      expect.objectContaining({
        code: "stale-generated-api",
        message: expect.stringContaining("DEFINITION_STAMP"),
      }),
    ]);
    expect(existsSync(join(tempDir, "project"))).toBe(false);

    const inspected = inspect(population, options);
    expect(inspected.ok).toBe(false);
    if (inspected.ok) {
      return;
    }
    expect(inspected.diagnostics.some((d) => d.code === "stale-generated-api")).toBe(true);
  });

  it("does not write a generated populate API as a side effect of apply", () => {
    const { architecture, constructs } = buildCleanArchitecture();
    const stamp = computeDefinitionStamp(architecture);
    const population = createPopulation(architecture, { definitionStamp: stamp });
    population.add(constructs.PackageJson, { name: "packageJson" });

    tempDir = mkdtempSync(join(tmpdir(), "struttura-no-implicit-codegen-"));
    const architectureDir = join(tempDir, "architecture");
    const result = apply(population, {
      architectureDir,
      materializationRoot: join(tempDir, "project"),
    });
    expect(result.ok).toBe(true);

    const strutturaDir = join(architectureDir, ".struttura");
    expect(existsSync(join(strutturaDir, "manifest.json"))).toBe(true);
    for (const name of ["populate-api.ts", "populate.ts", "generated.ts", "api.ts"]) {
      expect(existsSync(join(strutturaDir, name))).toBe(false);
    }
  });

  it("types DirRef and FileRef so a file ref is not assignable where a directory is required", () => {
    type ModelsArtifacts = { readonly models: DirRef; readonly source: FileRef };
    type CoreRef = { readonly artifacts: ModelsArtifacts };
    type FileDirectoryParam = Parameters<typeof file>[0]["directory"];

    expectTypeOf<CoreRef["artifacts"]["models"]>().toEqualTypeOf<DirRef>();
    expectTypeOf<CoreRef["artifacts"]["source"]>().toEqualTypeOf<FileRef>();

    // file() accepts DirRef | DirDescriptor, not FileRef (ADR 0012).
    expectTypeOf<DirRef>().toExtend<FileDirectoryParam>();
    expectTypeOf<FileRef>().not.toExtend<FileDirectoryParam>();
  });
});

function buildNavigableArchitecture() {
  const A = defineArchitecture("NavigableArchitecture");

  const WorkspaceRoot = A.construct("WorkspaceRoot", {}, () =>
    A.in(A.rootDirectory, {
      packageJson: A.file("package.json", '{ "name": "workspace" }\n'),
      tsconfig: A.file("tsconfig.json", "{}\n"),
    })
  );

  const CorePackage = A.construct("CorePackage", {}, ({ name }) =>
    A.in(
      A.rootDirectory,
      A.dir(`packages/core-${toKebabCase(name)}`, {
        packageJson: A.file("package.json", "{}\n"),
        tsconfig: A.file("tsconfig.json", "{}\n"),
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

  const AdapterPackage = A.construct("AdapterPackage", {}, ({ name }) =>
    A.in(
      A.rootDirectory,
      A.dir(`packages/adapter-${toKebabCase(name)}`, {
        packageJson: A.file("package.json", "{}\n"),
        repositories: A.dir({
          index: A.file("index.ts", "export {};\n"),
        }),
      })
    )
  );

  const Repository = A.construct("Repository", { adapter: AdapterPackage }, ({ name, adapter }) =>
    A.in(adapter.repositories, A.file(`${toKebabCase(name)}.repository.ts`, "export {};\n"))
  );

  const architecture = A.seal();
  return {
    A,
    architecture,
    constructs: {
      WorkspaceRoot,
      CorePackage,
      ModelsModule,
      Shape,
      AdapterPackage,
      Repository,
    },
  };
}

describe("codegen navigable tree (ticket 04)", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("probes tree artifact kinds including cross-instance placement and nesting", () => {
    const { architecture } = buildNavigableArchitecture();
    const kinds = probeArtifactKinds(architecture);

    expect(kinds.get("WorkspaceRoot")).toEqual({
      packageJson: "file",
      tsconfig: "file",
    });
    expect(kinds.get("CorePackage")).toEqual({
      ".": "directory",
      packageJson: "file",
      tsconfig: "file",
    });
    expect(kinds.get("ModelsModule")).toEqual({
      ".": "directory",
      index: "file",
    });
    expect(kinds.get("Shape")).toEqual({ ".": "file" });
    expect(kinds.get("AdapterPackage")).toEqual({
      ".": "directory",
      packageJson: "file",
      repositories: "directory",
      "repositories.index": "file",
    });
    expect(kinds.get("Repository")).toEqual({ ".": "file" });
  });

  it("derives navigable shapes without inventing a peer-root '.' child", () => {
    const { architecture } = buildNavigableArchitecture();
    const shapes = probeNavigableShapes(architecture);

    expect(shapes.get("WorkspaceRoot")).toEqual({
      root: "peer",
      children: {
        packageJson: { kind: "file" },
        tsconfig: { kind: "file" },
      },
    });
    expect(shapes.get("Shape")).toEqual({ root: "file" });
    expect(shapes.get("AdapterPackage")).toEqual({
      root: "directory",
      children: {
        packageJson: { kind: "file" },
        repositories: {
          kind: "directory",
          children: { index: { kind: "file" } },
        },
      },
    });
    expect(navigableShapeFromKinds({ ".": "file" })).toEqual({ root: "file" });
  });

  it("emits navigable refs without .artifacts and brands populate deps", () => {
    const { architecture } = buildNavigableArchitecture();
    const { source, stamp } = emitPopulateApi(architecture, {
      architectureModule: "../architecture",
    });

    expect(stamp).toBe(computeDefinitionStamp(architecture));
    expect(source).toContain('readonly __constructBrand: "CorePackage"');
    expect(source).toContain('readonly __constructBrand: "Shape"');
    expect(source).toContain('export type ShapeRef = Omit<InstanceRef, "artifacts"> & FileRef & {');
    expect(source).toContain(
      'export type CorePackageRef = Omit<InstanceRef, "artifacts"> & DirRef & {'
    );
    expect(source).toContain("readonly packageJson: FileRef;");
    expect(source).toContain("readonly tsconfig: FileRef;");
    expect(source).toContain("readonly repositories: DirRef & { readonly index: FileRef };");
    expect(source).toContain(
      "Shape(input: { name: string; id?: string; models: ModelsModuleRef })"
    );
    expect(source).toContain(
      "ModelsModule(input: { name: string; id?: string; core: CorePackageRef })"
    );

    // No legacy artifacts map on tree refs.
    expect(source).not.toContain("CorePackageArtifacts");
    expect(source).not.toContain("readonly artifacts: CorePackageArtifacts");
    expect(source).not.toContain('readonly ".":');
    expect(source).not.toContain("artifacts.packageJson");
  });

  it("keeps legacy .artifacts emission for flat constructs in the same emitter", () => {
    const { architecture } = buildCleanArchitecture();
    const { source } = emitPopulateApi(architecture, {
      architectureModule: "../architecture",
    });
    expect(source).toContain("export type CorePackageArtifacts = {");
    expect(source).toContain("readonly artifacts: CorePackageArtifacts;");
  });

  it("drives apply from a stamp-backed population of tree constructs", () => {
    const { architecture, constructs } = buildNavigableArchitecture();
    const stamp = computeDefinitionStamp(architecture);
    const population = createPopulation(architecture, { definitionStamp: stamp });

    population.add(constructs.WorkspaceRoot, { name: "workspace" });
    const core = population.add(constructs.CorePackage, { name: "pagebuilder" });
    const models = population.add(constructs.ModelsModule, {
      id: "pagebuilder-models",
      name: "models",
      core,
    });
    population.add(constructs.Shape, { name: "page", models });
    const adapter = population.add(constructs.AdapterPackage, { name: "contentful" });
    population.add(constructs.Repository, { name: "pageRepository", adapter });

    tempDir = mkdtempSync(join(tmpdir(), "struttura-nav-codegen-"));
    const result = apply(population, {
      architectureDir: join(tempDir, "architecture"),
      materializationRoot: join(tempDir, "project"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(readFileSync(join(tempDir, "project/package.json"), "utf8")).toBe(
      '{ "name": "workspace" }\n'
    );
    expect(
      existsSync(join(tempDir, "project/packages/core-pagebuilder/models/page.shape.ts"))
    ).toBe(true);
  });

  it("types generated-style navigable refs: no artifacts, wrong dep brand, FileRef not DirRef", () => {
    type CorePackageRef = Omit<InstanceRef, "artifacts"> &
      DirRef & {
        readonly __constructBrand: "CorePackage";
        readonly packageJson: FileRef;
        readonly tsconfig: FileRef;
      };

    type ModelsModuleRef = Omit<InstanceRef, "artifacts"> &
      DirRef & {
        readonly __constructBrand: "ModelsModule";
        readonly index: FileRef;
      };

    type ShapeRef = Omit<InstanceRef, "artifacts"> &
      FileRef & {
        readonly __constructBrand: "Shape";
      };

    type AdapterPackageRef = Omit<InstanceRef, "artifacts"> &
      DirRef & {
        readonly __constructBrand: "AdapterPackage";
        readonly repositories: DirRef & { readonly index: FileRef };
      };

    type ShapeInput = { name: string; id?: string; models: ModelsModuleRef };

    expectTypeOf<CorePackageRef>().not.toHaveProperty("artifacts");
    expectTypeOf<CorePackageRef["packageJson"]>().toEqualTypeOf<FileRef>();
    expectTypeOf<CorePackageRef["tsconfig"]>().toEqualTypeOf<FileRef>();
    expectTypeOf<ModelsModuleRef["index"]>().toEqualTypeOf<FileRef>();
    expectTypeOf<AdapterPackageRef["repositories"]["index"]>().toEqualTypeOf<FileRef>();

    expectTypeOf<CorePackageRef>().toExtend<PlacementDestination>();
    expectTypeOf<ModelsModuleRef>().toExtend<PlacementDestination>();
    expectTypeOf<ShapeRef>().not.toExtend<PlacementDestination>();
    expectTypeOf<ShapeRef>().toExtend<FileRef>();

    // Wrong dependency construct brand must not satisfy Shape's models slot.
    expectTypeOf<CorePackageRef>().not.toExtend<ShapeInput["models"]>();
    expectTypeOf<ModelsModuleRef>().toExtend<ShapeInput["models"]>();
  });
});
