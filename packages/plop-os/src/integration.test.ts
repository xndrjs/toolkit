import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runScaffold } from "./run-scaffold.js";

function write(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

/**
 * Fixture workspace: core-package + model generators, discovery of `models/`,
 * and a Sync generator that rebuilds a models barrel.
 */
function setupProofFixture(root: string, runtimeImportHref: string): string {
  const templatesDir = path.join(root, "templates");
  write(
    path.join(templatesDir, "core-package.json.hbs"),
    `{
  "name": "@demo/core-{{name}}",
  "private": true,
  "type": "module"
}
`
  );
  write(path.join(templatesDir, "models-index.ts.hbs"), `export {};\n`);
  write(path.join(templatesDir, "operations-index.ts.hbs"), `export {};\n`);
  write(path.join(templatesDir, "ports-index.ts.hbs"), `export {};\n`);
  write(
    path.join(templatesDir, "model.ts.hbs"),
    `export type {{pascalName name}} = { id: string };\n`
  );

  write(
    path.join(root, "packages/core-pagebuilder/models/index.ts"),
    `// handwritten barrel
// plop-os-sync start models-barrel
// plop-os-sync end models-barrel
`
  );
  write(
    path.join(root, "packages/core-pagebuilder/models/existing.model.ts"),
    `export type Existing = { id: string };\n`
  );
  mkdirSync(path.join(root, "packages/core-pagebuilder/operations"), { recursive: true });

  const plopfile = path.join(root, "plopfile.mjs");
  write(
    plopfile,
    `import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPlopOs, plopAddFlags } from ${JSON.stringify(runtimeImportHref)};

const root = path.dirname(fileURLToPath(import.meta.url));

export const plopOs = createPlopOs({
  roots: [root],
  ignore: ["node_modules", "dist", ".git", "templates"],
});

plopOs.addDiscoveryRule({
  name: "core-models",
  pattern: "packages/core-:coreName/models",
  label: ({ data }) => data.coreName ?? "",
});

plopOs.syncGenerator("models-barrel", (ctx) => {
  const modelsDir = path.dirname(ctx.filePath);
  const lines = [];
  function walk(dir, rel = ".") {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), rel === "." ? entry.name : \`\${rel}/\${entry.name}\`);
        continue;
      }
      if (!entry.name.endsWith(".model.ts")) continue;
      const base = entry.name.replace(/\\.model\\.ts$/, "");
      const importPath = rel === "." ? \`./\${base}.model.js\` : \`./\${rel}/\${base}.model.js\`;
      lines.push(\`export * from "\${importPath}";\`);
    }
  }
  walk(modelsDir);
  return lines.sort().join("\\n");
});

function pascalName(value) {
  return String(value)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");
}

export default function (plop) {
  plop.setHelper("pascalName", pascalName);

  plop.setGenerator("core-package", {
    description: "Scaffold a core package",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "core name",
        validate: (v) => (v && /^[a-z0-9-]+$/.test(v) ? true : "kebab-case name required"),
      },
    ],
    actions(answers) {
      const flags = plopAddFlags("throw");
      const base = "packages/core-" + answers.name;
      return [
        { type: "add", path: base + "/package.json", templateFile: "templates/core-package.json.hbs", ...flags },
        { type: "add", path: base + "/models/index.ts", templateFile: "templates/models-index.ts.hbs", ...flags },
        { type: "add", path: base + "/operations/index.ts", templateFile: "templates/operations-index.ts.hbs", ...flags },
        { type: "add", path: base + "/ports/index.ts", templateFile: "templates/ports-index.ts.hbs", ...flags },
      ];
    },
  });

  plop.setGenerator("model", {
    description: "Scaffold a model under a discovered models/ directory",
    prompts: [
      {
        type: "input",
        name: "modelsPath",
        message: "models directory",
        validate(v) {
          try {
            plopOs.resolveCandidate("core-models", v);
            return true;
          } catch (e) {
            return e instanceof Error ? e.message : "invalid models path";
          }
        },
      },
      {
        type: "input",
        name: "subdir",
        message: "optional subdirectory under models/",
        default: "",
      },
      {
        type: "input",
        name: "name",
        message: "model name",
        validate: (v) => (v && /^[a-z0-9-]+$/.test(v) ? true : "kebab-case name required"),
      },
    ],
    actions(answers) {
      const candidate = plopOs.resolveCandidate("core-models", answers.modelsPath);
      const dest = answers.subdir
        ? plopOs.resolveSubdir(candidate, answers.subdir)
        : candidate.path;
      const flags = plopAddFlags("throw");
      return [
        {
          type: "add",
          path: path.posix.join(dest, answers.name + ".model.ts"),
          templateFile: "templates/model.ts.hbs",
          ...flags,
        },
      ];
    },
  });
}
`
  );
  return plopfile;
}

describe("plop-os integration", () => {
  let root: string;
  let plopfile: string;
  let previousCwd: string;
  let runtimeHref: string;

  beforeAll(() => {
    const pkgRoot = path.resolve(import.meta.dirname, "..");
    execFileSync("pnpm", ["exec", "tsup"], { cwd: pkgRoot, stdio: "pipe" });
    runtimeHref = pathToFileURL(path.join(pkgRoot, "dist", "index.js")).href;
  });

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "plop-os-integration-"));
    plopfile = setupProofFixture(root, runtimeHref);
    previousCwd = process.cwd();
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(previousCwd);
    rmSync(root, { recursive: true, force: true });
  });

  it("1) scaffolds a core-like package via runScaffold", async () => {
    const result = await runScaffold({
      plopfile,
      generator: "core-package",
      answers: { name: "billing" },
    });

    expect(result.failures).toEqual([]);
    const base = path.join(root, "packages", "core-billing");
    expect(JSON.parse(readFileSync(path.join(base, "package.json"), "utf8"))).toMatchObject({
      name: "@demo/core-billing",
    });
    expect(existsSync(path.join(base, "models", "index.ts"))).toBe(true);
    expect(existsSync(path.join(base, "operations", "index.ts"))).toBe(true);
    expect(existsSync(path.join(base, "ports", "index.ts"))).toBe(true);
  });

  it("2) discovers models/ Candidate, rejects operations/, scaffolds model in subdir", async () => {
    const { plopOs } = await import(pathToFileURL(plopfile).href);
    const candidates = plopOs.candidates("core-models") as { data: { coreName: string } }[];
    expect(candidates.map((c) => c.data.coreName)).toEqual(["pagebuilder"]);

    await expect(
      runScaffold({
        plopfile,
        generator: "model",
        answers: {
          modelsPath: "packages/core-pagebuilder/operations",
          subdir: "",
          name: "nope",
        },
      })
    ).rejects.toThrow(/invalid input "modelsPath"/);

    await runScaffold({
      plopfile,
      generator: "model",
      answers: {
        modelsPath: "packages/core-pagebuilder/models",
        subdir: "strips",
        name: "hero",
      },
    });

    const heroPath = path.join(root, "packages/core-pagebuilder/models/strips/hero.model.ts");
    expect(readFileSync(heroPath, "utf8")).toContain("export type Hero");
  });

  it("3) sync updates marked barrel from handwritten + newly scaffolded models", async () => {
    await runScaffold({
      plopfile,
      generator: "model",
      answers: {
        modelsPath: "packages/core-pagebuilder/models",
        subdir: "strips",
        name: "hero",
      },
    });

    const { plopOs } = await import(pathToFileURL(plopfile).href);
    const syncResult = await plopOs.sync({ id: "models-barrel" });
    expect(syncResult.regionsUpdated).toBe(1);
    expect(syncResult.filesWritten.length).toBe(1);

    const barrel = readFileSync(
      path.join(root, "packages/core-pagebuilder/models/index.ts"),
      "utf8"
    );
    expect(barrel).toContain("// handwritten barrel");
    expect(barrel).toContain("// plop-os-sync start models-barrel");
    expect(barrel).toContain("// plop-os-sync end models-barrel");
    expect(barrel).toContain('export * from "./existing.model.js";');
    expect(barrel).toContain('export * from "./strips/hero.model.js";');
  });

  it("4) missing/invalid inputs fail without prompts", async () => {
    await expect(runScaffold({ plopfile, generator: "core-package", answers: {} })).rejects.toThrow(
      /missing required inputs: name/
    );

    await expect(
      runScaffold({
        plopfile,
        generator: "core-package",
        answers: { name: "NotKebab" },
      })
    ).rejects.toThrow(/invalid input "name"/);

    await expect(
      runScaffold({
        plopfile,
        generator: "model",
        answers: {
          modelsPath: "packages/core-pagebuilder/models",
          subdir: "",
          name: "Bad Name",
        },
      })
    ).rejects.toThrow(/invalid input "name"/);
  });
});
