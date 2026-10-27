import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPlopOs, plopAddFlags } from "@xndrjs/plop-os";

const root = path.dirname(fileURLToPath(import.meta.url));

export const plopOs = createPlopOs({
  roots: [root],
  ignore: ["node_modules", "dist", ".git", "templates", "scripts"],
});

/** Discovery: path-to-regexp bind for core package models dirs. */
plopOs.addDiscoveryRule({
  name: "core-models",
  pattern: "packages/core-:coreName/models",
  label: ({ data }) => data.coreName,
});

/** Discovery: escape hatch — regex named groups for apps/*. */
plopOs.addDiscoveryRule({
  name: "apps",
  pattern: /^apps\/(?<appName>[^/]+)$/,
  label: ({ data }) => data.appName,
});

/** Sync: rebuild models barrel from *.model.ts under the Region's directory. */
plopOs.syncGenerator("models-barrel", (ctx) => {
  const modelsDir = path.dirname(ctx.filePath);
  const lines = [];

  function walk(dir, rel = ".") {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), rel === "." ? entry.name : `${rel}/${entry.name}`);
        continue;
      }
      if (!entry.name.endsWith(".model.ts")) continue;
      const base = entry.name.replace(/\.model\.ts$/, "");
      const importPath = rel === "." ? `./${base}.model.js` : `./${rel}/${base}.model.js`;
      lines.push(`export * from "${importPath}";`);
    }
  }

  walk(modelsDir);
  return lines.sort().join("\n") + (lines.length ? "\n" : "");
});

/** Sync: catalog of discovered core packages (uses Discovery from ctx). */
plopOs.syncGenerator("core-catalog", (ctx) => {
  const hits = ctx.discovery.listCandidates("core-models");
  const lines = hits.map((c) => `  - ${c.data.coreName} → ${c.path}`).sort();
  return lines.length ? `${lines.join("\n")}\n` : "  (none)\n";
});

function pascalName(value) {
  return String(value)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");
}

function kebabOk(v) {
  return Boolean(v && /^[a-z0-9-]+$/.test(v));
}

export default function (plop) {
  plop.setHelper("pascalName", pascalName);

  plop.setGenerator("core-package", {
    description: "Scaffold a core-like package (models / operations / ports)",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "core name (kebab-case)",
        validate: (v) => (kebabOk(v) ? true : "kebab-case name required"),
      },
    ],
    actions(answers) {
      const flags = plopAddFlags("throw");
      const base = `packages/core-${answers.name}`;
      return [
        {
          type: "add",
          path: `${base}/package.json`,
          templateFile: "templates/core-package.json.hbs",
          ...flags,
        },
        {
          type: "add",
          path: `${base}/models/index.ts`,
          templateFile: "templates/models-index.ts.hbs",
          ...flags,
        },
        {
          type: "add",
          path: `${base}/operations/index.ts`,
          templateFile: "templates/operations-index.ts.hbs",
          ...flags,
        },
        {
          type: "add",
          path: `${base}/ports/index.ts`,
          templateFile: "templates/ports-index.ts.hbs",
          ...flags,
        },
      ];
    },
  });

  plop.setGenerator("model", {
    description: "Scaffold a model under a discovered models/ Candidate",
    prompts: [
      {
        type: "input",
        name: "modelsPath",
        message: "models directory (must be a core-models Candidate)",
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
        message: "model name (kebab-case)",
        validate: (v) => (kebabOk(v) ? true : "kebab-case name required"),
      },
    ],
    actions(answers) {
      const candidate = plopOs.resolveCandidate("core-models", answers.modelsPath);
      const dest = answers.subdir
        ? plopOs.resolveSubdir(candidate, answers.subdir)
        : candidate.path;
      const rel = path.relative(root, dest).split(path.sep).join("/");
      const flags = plopAddFlags("throw");
      return [
        {
          type: "add",
          path: `${rel}/{{name}}.model.ts`,
          templateFile: "templates/model.ts.hbs",
          ...flags,
        },
      ];
    },
  });

  plop.setGenerator("app", {
    description: "Scaffold an apps/* directory (regex Discovery hatch)",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "app name (kebab-case)",
        validate: (v) => (kebabOk(v) ? true : "kebab-case name required"),
      },
    ],
    actions() {
      return [
        {
          type: "add",
          path: "apps/{{name}}/README.md",
          templateFile: "templates/app-readme.md.hbs",
          ...plopAddFlags("throw"),
        },
      ];
    },
  });

  plop.setGenerator("catalog", {
    description: "Scaffold CATALOG.md with an empty core-catalog Region",
    prompts: [],
    actions: [
      {
        type: "add",
        path: "CATALOG.md",
        templateFile: "templates/catalog.md.hbs",
        ...plopAddFlags("throw"),
      },
    ],
  });

  plop.setGenerator("note", {
    description: "Tiny Scaffold example with conflict throw policy",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "note name",
        validate: (v) => (kebabOk(v) ? true : "kebab-case name required"),
      },
    ],
    actions() {
      return [
        {
          type: "add",
          path: "notes/{{name}}.txt",
          template: "hello {{name}}\n",
          ...plopAddFlags("throw"),
        },
      ];
    },
  });
}
