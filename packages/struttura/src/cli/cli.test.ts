import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { parseCliArgs } from "./args";
import { runCli } from "./run";

const packageRoot = join(fileURLToPath(new URL("../..", import.meta.url)));
const strutturaEntry = join(packageRoot, "src/index.ts");

describe("CLI args", () => {
  it("parses the four wave-1 commands", () => {
    expect(parseCliArgs(["codegen", "--architecture", "./a.ts", "--out", "./out.ts"])).toEqual({
      command: "codegen",
      architecture: "./a.ts",
      out: "./out.ts",
      architectureModule: undefined,
      architectureExport: "architecture",
      constructsExport: "constructs",
      strutturaPackage: "@xndrjs/struttura",
      help: false,
    });

    expect(
      parseCliArgs([
        "apply",
        "--population",
        "./p.ts",
        "--architecture-dir",
        "./architecture",
        "--materialization-root",
        "./project",
      ])
    ).toEqual({
      command: "apply",
      population: "./p.ts",
      architectureDir: "./architecture",
      materializationRoot: "./project",
      help: false,
    });

    expect(
      parseCliArgs([
        "inspect",
        "--population",
        "./p.ts",
        "--architecture-dir",
        "./architecture",
        "--materialization-root",
        "./project",
        "--json",
      ])
    ).toMatchObject({ command: "inspect", json: true });

    expect(
      parseCliArgs([
        "migrate-id",
        "--architecture-dir",
        "./architecture",
        "--from",
        "page",
        "--to",
        "editorialPage",
      ])
    ).toEqual({
      command: "migrate-id",
      architectureDir: "./architecture",
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
    const architectureDir = join(tempDir, "architecture");
    const materializationRoot = join(tempDir, "project");
    mkdirSync(architectureDir, { recursive: true });

    const architecturePath = join(architectureDir, "architecture.ts");
    const populateApiPath = join(architectureDir, "populate-api.ts");
    const populationPath = join(architectureDir, "population.ts");

    const strutturaImport = relative(architectureDir, strutturaEntry).split("\\").join("/");
    const strutturaSpecifier = strutturaImport.startsWith(".")
      ? strutturaImport
      : `./${strutturaImport}`;

    writeFileSync(
      architecturePath,
      `import { defineArchitecture, dir, file, root, constructsFromArchitecture } from "${strutturaSpecifier}";
import { toKebabCase } from "${strutturaSpecifier}";

const A = defineArchitecture("CleanArchitecture");

export const CorePackage = A.defineConstruct("CorePackage", ({ name }) => {
  const packageDirectory = dir(\`packages/core-\${toKebabCase(name)}\`);
  const models = dir(\`\${packageDirectory.path}/models\`);
  return {
    packageDirectory,
    models,
    modelsIndex: file({ filename: "index.ts", directory: models, mode: "sync", content: "// barrel\\n" }),
  };
});

export const Model = A.defineConstruct("Model", { core: CorePackage }, ({ name, core }) => ({
  source: file({
    filename: \`\${toKebabCase(name)}.model.ts\`,
    directory: core.artifacts.models,
    mode: "scaffold",
    content: \`export type \${name} = { id: string };\\n\`,
  }),
}));

export const PackageJson = A.defineConstruct("PackageJson", () => ({
  packageJson: file({
    filename: "package.json",
    directory: root,
    mode: "scaffold",
    content: '{ "name": "project" }\\n',
  }),
}));

export const architecture = A.seal();
export const constructs = constructsFromArchitecture(architecture);
`,
      "utf8"
    );

    const codegenCode = await runCli([
      "codegen",
      "--architecture",
      architecturePath,
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
      "--architecture-dir",
      architectureDir,
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
      "--architecture-dir",
      architectureDir,
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
      "--architecture-dir",
      architectureDir,
      "--from",
      "page",
      "--to",
      "editorialPage",
    ]);
    expect(migrateCode).toBe(0);

    const manifestAfterMigrate = JSON.parse(
      readFileSync(join(architectureDir, ".struttura/manifest.json"), "utf8")
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
    ).toMatchObject({ instanceId: "editorialPage", artifactKey: "source" });

    const applyAfterMigrate = await runCli([
      "apply",
      "--population",
      populationPath,
      "--architecture-dir",
      architectureDir,
      "--materialization-root",
      materializationRoot,
    ]);
    expect(applyAfterMigrate).toBe(0);
  });
});
