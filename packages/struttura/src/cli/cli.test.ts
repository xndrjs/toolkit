import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { parseCliArgs } from "./args";
import { runCli } from "./run";

const packageRoot = join(fileURLToPath(new URL("../..", import.meta.url)));
const strutturaEntry = join(packageRoot, "src/index.ts");

describe("CLI args", () => {
  it("parses the wave-1 commands", () => {
    expect(parseCliArgs(["codegen", "--structure", "./a.ts", "--out", "./out.ts"])).toEqual({
      command: "codegen",
      structure: "./a.ts",
      out: "./out.ts",
      structureModule: undefined,
      structureExport: "structure",
      constructsExport: "constructs",
      strutturaPackage: "@xndrjs/struttura",
      help: false,
    });

    expect(
      parseCliArgs([
        "apply",
        "--population",
        "./p.ts",
        "--structure-dir",
        "./structure",
        "--materialization-root",
        "./project",
      ])
    ).toEqual({
      command: "apply",
      population: "./p.ts",
      structureDir: "./structure",
      materializationRoot: "./project",
      prune: false,
      sync: true,
      zombieWarn: true,
      help: false,
    });

    expect(
      parseCliArgs([
        "apply",
        "--population",
        "./p.ts",
        "--structure-dir",
        "./structure",
        "--materialization-root",
        "./project",
        "--prune",
        "--no-sync",
        "--no-zombie-warn",
      ])
    ).toMatchObject({ prune: true, sync: false, zombieWarn: false });

    expect(
      parseCliArgs([
        "inspect",
        "--population",
        "./p.ts",
        "--structure-dir",
        "./structure",
        "--materialization-root",
        "./project",
        "--json",
      ])
    ).toMatchObject({ command: "inspect", json: true, prune: false, sync: true });

    expect(
      parseCliArgs([
        "prune",
        "--population",
        "./p.ts",
        "--structure-dir",
        "./structure",
        "--materialization-root",
        "./project",
      ])
    ).toEqual({
      command: "prune",
      population: "./p.ts",
      structureDir: "./structure",
      materializationRoot: "./project",
      help: false,
    });

    expect(
      parseCliArgs([
        "migrate-id",
        "--structure-dir",
        "./structure",
        "--from",
        "page",
        "--to",
        "editorialPage",
      ])
    ).toEqual({
      command: "migrate-id",
      structureDir: "./structure",
      from: "page",
      to: "editorialPage",
      help: false,
    });
  });
});

describe("CLI end-to-end on guide layout", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("runs codegen, apply, inspect, and migrate-id", async () => {
    // Keep the fixture under the package so relative imports to src/ resolve via jiti.
    tempDir = mkdtempSync(join(packageRoot, ".tmp-cli-"));
    const structureDir = join(tempDir, "structure");
    const materializationRoot = join(tempDir, "project");
    mkdirSync(structureDir, { recursive: true });

    const structurePath = join(structureDir, "structure.ts");
    const populateApiPath = join(structureDir, "populate-api.ts");
    const populationPath = join(structureDir, "population.ts");

    const strutturaImport = relative(structureDir, strutturaEntry).split("\\").join("/");
    const strutturaSpecifier = strutturaImport.startsWith(".")
      ? strutturaImport
      : `./${strutturaImport}`;

    writeFileSync(
      structurePath,
      `import { defineStructure, constructsFromStructure, toKebabCase } from "${strutturaSpecifier}";

const A = defineStructure("CleanArchitecture");

export const CorePackage = A.construct("CorePackage", {}, ({ name }) =>
  A.in(
    A.rootDirectory,
    A.dir(\`packages/core-\${toKebabCase(name)}\`, {
      models: A.dir({
        index: A.file("index.ts", "// barrel\\n", { mode: "sync" }),
      }),
    })
  )
);

export const Model = A.construct("Model", { core: CorePackage }, ({ name, core }) =>
  A.in(
    core.models,
    A.file(\`\${toKebabCase(name)}.model.ts\`, \`export type \${name} = { id: string };\\n\`)
  )
);

export const PackageJson = A.construct("PackageJson", {}, () =>
  A.in(A.rootDirectory, {
    packageJson: A.file("package.json", '{ "name": "project" }\\n'),
  })
);

export const structure = A.seal();
export const constructs = constructsFromStructure(structure);
`,
      "utf8"
    );

    const codegenCode = await runCli([
      "codegen",
      "--structure",
      structurePath,
      "--out",
      populateApiPath,
      "--struttura-package",
      strutturaSpecifier,
    ]);
    expect(codegenCode).toBe(0);
    expect(existsSync(populateApiPath)).toBe(true);
    expect(readFileSync(populateApiPath, "utf8")).toContain("DEFINITION_STAMP");

    writeFileSync(
      populationPath,
      `import { createPopulateApi } from "./populate-api.ts";

const api = createPopulateApi();
const pagebuilder = api.CorePackage({ name: "pagebuilder" });
api.Model({ id: "page", name: "editorialPage", core: pagebuilder });
api.PackageJson({ name: "packageJson" });

export const population = api.population;
`,
      "utf8"
    );

    const applyCode = await runCli([
      "apply",
      "--population",
      populationPath,
      "--structure-dir",
      structureDir,
      "--materialization-root",
      materializationRoot,
    ]);
    expect(applyCode).toBe(0);
    expect(existsSync(join(materializationRoot, "package.json"))).toBe(true);
    expect(
      existsSync(
        join(materializationRoot, "packages/core-pagebuilder/models/editorial-page.model.ts")
      )
    ).toBe(true);

    const inspectCode = await runCli([
      "inspect",
      "--population",
      populationPath,
      "--structure-dir",
      structureDir,
      "--materialization-root",
      materializationRoot,
      "--json",
    ]);
    expect(inspectCode).toBe(0);

    // Author drops explicit id after migrating identity page → editorialPage.
    writeFileSync(
      populationPath,
      `import { createPopulateApi } from "./populate-api.ts";

const api = createPopulateApi();
const pagebuilder = api.CorePackage({ name: "pagebuilder" });
api.Model({ name: "editorialPage", core: pagebuilder });
api.PackageJson({ name: "packageJson" });

export const population = api.population;
`,
      "utf8"
    );

    const migrateCode = await runCli([
      "migrate-id",
      "--structure-dir",
      structureDir,
      "--from",
      "page",
      "--to",
      "editorialPage",
    ]);
    expect(migrateCode).toBe(0);

    const manifestAfterMigrate = JSON.parse(
      readFileSync(join(structureDir, ".struttura/manifest.json"), "utf8")
    ) as {
      instances: { id: string }[];
      artifacts: { instanceId: string; artifactKey: string; path: string }[];
    };
    expect(manifestAfterMigrate.instances.map((i) => i.id).sort()).toEqual([
      "editorialPage",
      "packageJson",
      "pagebuilder",
    ]);
    expect(
      manifestAfterMigrate.artifacts.find((a) => a.path.endsWith("editorial-page.model.ts"))
    ).toMatchObject({ instanceId: "editorialPage", artifactKey: "." });

    const applyAfterMigrate = await runCli([
      "apply",
      "--population",
      populationPath,
      "--structure-dir",
      structureDir,
      "--materialization-root",
      materializationRoot,
    ]);
    expect(applyAfterMigrate).toBe(0);
  });
});
