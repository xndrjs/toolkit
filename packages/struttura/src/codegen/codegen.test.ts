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
} from "../architecture/define-architecture";
import { toKebabCase } from "../casing/casing";
import { createPopulation } from "../population/create-population";
import { apply } from "../apply/apply";
import { inspect } from "../inspect/inspect";
import {
  computeDefinitionStamp,
  constructsFromArchitecture,
  emitPopulateApi,
  probeArtifactKinds,
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
