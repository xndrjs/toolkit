import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runScaffold } from "./run-scaffold.js";

function write(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

/** Tiny fixture plopfile: static prompts, Candidate validate, conflict throw. */
function writeFixture(root: string, runtimeImportHref: string): string {
  const plopfile = path.join(root, "plopfile.mjs");
  write(
    plopfile,
    `import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPlopOs, plopAddFlags } from ${JSON.stringify(runtimeImportHref)};

const root = path.dirname(fileURLToPath(import.meta.url));

export const plopOs = createPlopOs({
  roots: [root],
  ignore: ["node_modules", "dist", ".git"],
});

plopOs.addDiscoveryRule({
  name: "core-models",
  pattern: "packages/core-:coreName/models",
});

export default function (plop) {
  plop.setGenerator("note", {
    description: "Add a note file",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "note name",
        validate: (v) => (v && /^[a-z0-9-]+$/.test(v) ? true : "kebab-case name required"),
      },
    ],
    actions() {
      const flags = plopAddFlags("throw");
      return [
        {
          type: "add",
          path: "notes/{{name}}.txt",
          template: "hello {{name}}\\n",
          ...flags,
        },
      ];
    },
  });

  plop.setGenerator("model", {
    description: "Scaffold under a discovered models/ Candidate",
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
        name: "name",
        message: "model name",
        validate: (v) => (v && /^[a-z0-9-]+$/.test(v) ? true : "kebab-case name required"),
      },
    ],
    actions(answers) {
      const candidate = plopOs.resolveCandidate("core-models", answers.modelsPath);
      const flags = plopAddFlags("throw");
      return [
        {
          type: "add",
          path: path.posix.join(candidate.path, answers.name + ".model.ts"),
          template: "export type Model = { id: string };\\n",
          ...flags,
        },
      ];
    },
  });

  plop.setGenerator("dynamic-prompts", {
    description: "Rejected in v1 non-interactive",
    prompts: () => [{ type: "input", name: "name", message: "n" }],
    actions: [],
  });
}
`
  );
  return plopfile;
}

describe("runScaffold", () => {
  let root: string;
  let plopfile: string;
  let previousCwd: string;
  let runtimeHref: string;

  beforeAll(() => {
    // node-plop loads the plopfile with native Node ESM, so the fixture must
    // import the built package surface (Vitest TS resolution does not apply).
    const pkgRoot = path.resolve(import.meta.dirname, "..");
    execFileSync("pnpm", ["exec", "tsup"], { cwd: pkgRoot, stdio: "pipe" });
    runtimeHref = pathToFileURL(path.join(pkgRoot, "dist", "index.js")).href;
  });

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "plop-os-scaffold-"));
    mkdirSync(path.join(root, "packages", "core-orders", "models"), { recursive: true });
    plopfile = writeFixture(root, runtimeHref);
    previousCwd = process.cwd();
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(previousCwd);
    rmSync(root, { recursive: true, force: true });
  });

  it("happy path: adds a file from static answers without prompting", async () => {
    const result = await runScaffold({
      plopfile,
      generator: "note",
      answers: { name: "hello" },
    });

    expect(result.generator).toBe("note");
    expect(result.failures).toEqual([]);
    expect(readFileSync(path.join(root, "notes", "hello.txt"), "utf8")).toBe("hello hello\n");
  });

  it("throws when a required answer is missing (undefined/null)", async () => {
    await expect(runScaffold({ plopfile, generator: "note", answers: {} })).rejects.toThrow(
      /missing required inputs: name/
    );

    await expect(
      runScaffold({ plopfile, generator: "note", answers: { name: null } })
    ).rejects.toThrow(/missing required inputs: name/);
  });

  it("throws when prompt validate rejects a non-Candidate path", async () => {
    await expect(
      runScaffold({
        plopfile,
        generator: "model",
        answers: {
          modelsPath: path.join(root, "packages"),
          name: "order",
        },
      })
    ).rejects.toThrow(/invalid input "modelsPath"/);
  });

  it("scaffolds under a valid Candidate after shared validate", async () => {
    const models = path.join(root, "packages", "core-orders", "models");
    await runScaffold({
      plopfile,
      generator: "model",
      answers: { modelsPath: models, name: "order" },
    });
    expect(readFileSync(path.join(models, "order.model.ts"), "utf8")).toContain(
      "export type Model"
    );
  });

  it("conflict throw fails when the target file already exists", async () => {
    write(path.join(root, "notes", "hello.txt"), "existing\n");

    await expect(
      runScaffold({
        plopfile,
        generator: "note",
        answers: { name: "hello" },
      })
    ).rejects.toThrow(/scaffold actions failed/);

    expect(readFileSync(path.join(root, "notes", "hello.txt"), "utf8")).toBe("existing\n");
  });

  it("rejects dynamic prompts functions in v1", async () => {
    await expect(
      runScaffold({
        plopfile,
        generator: "dynamic-prompts",
        answers: { name: "x" },
      })
    ).rejects.toThrow(/dynamic prompts/);
  });

  it("treats empty string as provided (optional fields) and never waits on stdin", async () => {
    const result = await runScaffold({
      plopfile,
      generator: "note",
      answers: { name: "ok", subdir: "" },
    });
    expect(result.failures).toEqual([]);
  });
});
