import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPlopOs, plopAddFlags } from "@xndrjs/plop-os";

const root = path.dirname(fileURLToPath(import.meta.url));

export const plopOs = createPlopOs({
  roots: [root],
  ignore: ["node_modules", "dist", ".git", "templates", "scripts"],
});

/** Discovery: path-to-regexp bind for core package models dirs. */
const coreModelsRule = plopOs.addDiscoveryRule({
  name: "core-models",
  pattern: "packages/core-:coreName/models",
  label: ({ data }) => data.coreName,
  filter: ({ kind }) => kind === "directory",
});

/**
 * Discovery: directories under a core's models/ (root + nested), for destination picks.
 * @type {import("@xndrjs/plop-os").DiscoveryRule<{ coreName: string; dirPath: string }>}
 */
const modelsDirsRule = plopOs.addDiscoveryRule({
  name: "models-dirs",
  pattern: /^packages\/core-(?<coreName>[^/]+)\/models(?:\/(?<dirPath>.+))?$/,
  label: ({ data }) => data.dirPath || ".",
  filter: ({ kind }) => kind === "directory",
});

/**
 * Discovery: *.model.ts files (dirs + files enumeration).
 * Regex escape hatch — data shape declared once on the rule handle.
 * @type {import("@xndrjs/plop-os").DiscoveryRule<{ coreName: string; modelPath: string }>}
 */
const modelFilesRule = plopOs.addDiscoveryRule({
  name: "model-files",
  pattern: /^packages\/core-(?<coreName>[^/]+)\/models\/(?<modelPath>.+)\.model\.ts$/,
  label: ({ data }) => data.modelPath,
  filter: ({ kind }) => kind === "file",
});

/**
 * Discovery: escape hatch — regex named groups for apps/*.
 * @type {import("@xndrjs/plop-os").DiscoveryRule<{ appName: string }>}
 */
const appsRule = plopOs.addDiscoveryRule({
  name: "apps",
  pattern: /^apps\/(?<appName>[^/]+)$/,
  label: ({ data }) => data.appName,
  filter: ({ kind }) => kind === "directory",
});

/** Sync: rebuild models barrel via Discovery of model-files under this Region. */
plopOs.syncGenerator("models-barrel", (ctx) => {
  const modelsDir = path.dirname(ctx.filePath);
  const hits = ctx.discovery.listCandidates(modelFilesRule, modelsDir);
  const lines = hits.map((c) => {
    const rel = path.relative(modelsDir, c.path).split(path.sep).join("/");
    return `export * from "./${rel.replace(/\.ts$/, "")}";`;
  });
  return lines.sort().join("\n") + (lines.length ? "\n" : "");
});

/** Sync: catalog of discovered core packages (typed rule handle → data.coreName). */
plopOs.syncGenerator("core-catalog", (ctx) => {
  const hits = ctx.discovery.listCandidates(coreModelsRule);
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
    description: "Scaffold a model under a discovered models/ directory",
    prompts: [
      {
        type: "list",
        name: "modelsPath",
        message: "core (models Candidate)",
        choices() {
          const cores = plopOs.candidates(coreModelsRule);
          if (cores.length === 0) {
            throw new Error("no cores — run core-package first");
          }
          return cores.map((c) => ({ name: c.label, value: c.path }));
        },
        validate(v) {
          try {
            plopOs.resolveCandidate(coreModelsRule, v);
            return true;
          } catch (e) {
            return e instanceof Error ? e.message : "invalid models path";
          }
        },
      },
      {
        type: "list",
        name: "destPath",
        message: "destination directory under models/",
        choices(answers) {
          if (!answers.modelsPath) {
            throw new Error("select a core first");
          }
          const dirs = plopOs.candidates(modelsDirsRule, answers.modelsPath);
          if (dirs.length === 0) {
            throw new Error("no destination directories under that core");
          }
          return dirs.map((c) => {
            const rel = path.relative(answers.modelsPath, c.path).split(path.sep).join("/") || ".";
            return {
              name: rel === "." ? "(models root)" : rel,
              value: c.path,
            };
          });
        },
      },
      {
        type: "input",
        name: "name",
        message: "model name (kebab-case)",
        validate: (v) => (kebabOk(v) ? true : "kebab-case name required"),
      },
    ],
    actions(answers) {
      const flags = plopAddFlags("throw");
      const rel = path.relative(root, answers.destPath).split(path.sep).join("/");
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

export { coreModelsRule, modelsDirsRule, modelFilesRule, appsRule };
