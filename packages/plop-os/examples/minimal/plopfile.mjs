import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// In your project: `import { createPlopOs, plopAddFlags } from "plop-os"`.
import { createPlopOs, plopAddFlags } from "../../dist/index.js";

const root = path.dirname(fileURLToPath(import.meta.url));

export const plopOs = createPlopOs({
  roots: [root],
  ignore: ["node_modules", "dist", ".git", "templates"],
});

plopOs.addDiscoveryRule({
  name: "pkg-models",
  pattern: "packages/:pkgName/models",
  label: ({ data }) => data.pkgName,
});

plopOs.syncGenerator("models-barrel", (ctx) => {
  const modelsDir = path.dirname(ctx.filePath);
  const lines = [];
  for (const entry of fs.readdirSync(modelsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".model.ts")) continue;
    const base = entry.name.replace(/\.model\.ts$/, "");
    lines.push(`export * from "./${base}.model.js";`);
  }
  return lines.sort().join("\n") + (lines.length ? "\n" : "");
});

export default function (plop) {
  plop.setGenerator("model", {
    description: "Scaffold a model under a discovered models/ directory",
    prompts: [
      {
        type: "input",
        name: "modelsPath",
        message: "models directory",
        validate(v) {
          try {
            plopOs.resolveCandidate("pkg-models", v);
            return true;
          } catch (e) {
            return e instanceof Error ? e.message : "invalid models path";
          }
        },
      },
      {
        type: "input",
        name: "name",
        message: "model name",
        validate: (v) => (v && /^[a-z0-9-]+$/.test(v) ? true : "kebab-case name required"),
      },
    ],
    actions(answers) {
      const candidate = plopOs.resolveCandidate("pkg-models", answers.modelsPath);
      const flags = plopAddFlags("throw");
      const rel = path.relative(root, candidate.path).split(path.sep).join("/");
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
}
