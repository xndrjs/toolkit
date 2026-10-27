#!/usr/bin/env node
/**
 * Executable proof for the agreed v1 slice:
 * 1) Plop scaffold creates a core package
 * 2) Discovery finds models/ and scaffolds a model (optional subdir)
 * 3) Sync updates a marked barrel region
 * 4) All steps run without prompts, with shared validation
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import nodePlop from "node-plop";

import { runScaffold } from "./run-scaffold.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const workspace = path.join(pkgRoot, ".spike-workspace");
const templatesDir = path.join(workspace, "templates");

function rimraf(target: string): void {
  fs.rmSync(target, { recursive: true, force: true });
}

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function setupFixture(): void {
  rimraf(workspace);
  fs.mkdirSync(templatesDir, { recursive: true });

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
    path.join(workspace, "packages/core-pagebuilder/models/index.ts"),
    `// handwritten barrel
// plop-os-sync start models-barrel
// plop-os-sync end models-barrel
`
  );
  write(
    path.join(workspace, "packages/core-pagebuilder/models/existing.model.ts"),
    `export type Existing = { id: string };\n`
  );

  write(
    path.join(workspace, "plopfile.mjs"),
    `import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPlopOs, plopAddFlags } from "../dist/index.js";

const root = path.dirname(fileURLToPath(import.meta.url));

export const plopOs = createPlopOs({
  roots: [root],
  ignore: ["node_modules", "dist", ".git", "templates"],
});

plopOs.addDiscoveryRule({
  name: "core-models",
  pattern: /^packages\\/core-(?<coreName>[^/]+)\\/models$/,
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
}

async function main(): Promise<void> {
  setupFixture();
  const plopfile = path.join(workspace, "plopfile.mjs");
  const previousCwd = process.cwd();
  process.chdir(workspace);

  try {
    const core = await runScaffold({
      plopfile,
      generator: "core-package",
      answers: { name: "billing" },
    });
    console.log("scaffold:core-package", JSON.stringify(core.changes));

    let rejected = false;
    try {
      await runScaffold({
        plopfile,
        generator: "model",
        answers: {
          modelsPath: "packages/core-pagebuilder/operations",
          subdir: "",
          name: "nope",
        },
      });
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error("expected invalid modelsPath to fail validation");
    }
    console.log("validate:rejected-operations-path");

    const plopOsMod = await import(pathToFileURL(plopfile).href);
    const plopOs = plopOsMod.plopOs;
    const candidates = plopOs.candidates("core-models");
    console.log("discovery:candidates", JSON.stringify(candidates));

    const model = await runScaffold({
      plopfile,
      generator: "model",
      answers: {
        modelsPath: "packages/core-pagebuilder/models",
        subdir: "strips",
        name: "hero",
      },
    });
    console.log("scaffold:model", JSON.stringify(model.changes));

    const heroPath = path.join(workspace, "packages/core-pagebuilder/models/strips/hero.model.ts");
    if (!fs.existsSync(heroPath)) {
      throw new Error(`missing scaffolded model: ${heroPath}`);
    }

    const syncResult = await plopOs.sync({ id: "models-barrel" });
    console.log("sync:models-barrel", JSON.stringify(syncResult));

    const barrel = fs.readFileSync(
      path.join(workspace, "packages/core-pagebuilder/models/index.ts"),
      "utf8"
    );
    console.log("barrel:\n" + barrel);
    if (!barrel.includes('export * from "./existing.model.js";')) {
      throw new Error("barrel missing existing.model export");
    }
    if (!barrel.includes('export * from "./strips/hero.model.js";')) {
      throw new Error("barrel missing strips/hero.model export");
    }

    let missingFailed = false;
    try {
      await runScaffold({ plopfile, generator: "core-package", answers: {} });
    } catch {
      missingFailed = true;
    }
    if (!missingFailed) throw new Error("expected missing inputs to fail");
    console.log("validate:missing-inputs");

    const plop = await nodePlop(plopfile);
    console.log(
      "plop:generators",
      plop.getGeneratorList().map((g) => g.name)
    );

    console.log("\nSPIKE_OK");
  } finally {
    process.chdir(previousCwd);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
