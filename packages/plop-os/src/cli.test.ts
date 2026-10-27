import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "./cli/run.js";
import { ensureDist } from "./test-utils/ensure-dist.js";

function write(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

function collectStream(): {
  stream: NodeJS.WritableStream;
  text: () => string;
} {
  const chunks: Buffer[] = [];
  const stream = {
    write(chunk: string | Buffer): boolean {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      return true;
    },
  } as NodeJS.WritableStream;
  return {
    stream,
    text: () => Buffer.concat(chunks).toString("utf8"),
  };
}

/** Fixture covering scaffold + discovery + sync for CLI smoke. */
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

plopOs.syncGenerator("models-barrel", async (ctx) => {
  const hits = ctx.discovery.listCandidates("core-models");
  const lines = hits
    .map((c) => 'export * from "./' + c.data.coreName + '.stub.js";')
    .sort();
  return lines.join("\\n") + (lines.length ? "\\n" : "");
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
}
`
  );
  return plopfile;
}

describe("plop-os CLI", () => {
  let root: string;
  let runtimeHref: string;
  let cliJs: string;

  beforeAll(() => {
    ({ runtimeHref, cliJs } = ensureDist());
    execFileSync(process.execPath, ["--check", cliJs], { stdio: "pipe" });
  });

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "plop-os-cli-"));
    mkdirSync(path.join(root, "packages", "core-orders", "models"), { recursive: true });
    mkdirSync(path.join(root, "packages", "core-billing", "models"), { recursive: true });
    writeFixture(root, runtimeHref);
    write(
      path.join(root, "packages", "core-orders", "models", "index.ts"),
      ["// plop-os-sync start models-barrel", "old", "// plop-os-sync end models-barrel", ""].join(
        "\n"
      )
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("help prints commands without requiring a plopfile", async () => {
    const empty = mkdtempSync(path.join(tmpdir(), "plop-os-cli-help-"));
    try {
      const out = collectStream();
      const err = collectStream();
      const code = await runCli(["help"], { cwd: empty, stdout: out.stream, stderr: err.stream });
      expect(code).toBe(0);
      expect(err.text()).toBe("");
      const json = JSON.parse(out.text()) as { commands: string[] };
      expect(json.commands).toEqual(
        expect.arrayContaining([
          "generators",
          expect.stringContaining("candidates"),
          expect.stringContaining("run"),
          expect.stringContaining("sync"),
        ])
      );
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("generators lists scaffold, sync IDs, and discovery rules", async () => {
    const out = collectStream();
    const err = collectStream();
    const code = await runCli(["generators"], {
      cwd: root,
      stdout: out.stream,
      stderr: err.stream,
    });
    expect(code).toBe(0);
    expect(err.text()).toBe("");
    const json = JSON.parse(out.text()) as {
      scaffold: { name: string }[];
      sync: string[];
      discoveryRules: string[];
    };
    expect(json.scaffold.map((g) => g.name)).toContain("note");
    expect(json.sync).toEqual(["models-barrel"]);
    expect(json.discoveryRules).toEqual(["core-models"]);
  });

  it("candidates --rule lists hits; --base narrows", async () => {
    const out = collectStream();
    const code = await runCli(["candidates", "--rule", "core-models"], {
      cwd: root,
      stdout: out.stream,
      stderr: collectStream().stream,
    });
    expect(code).toBe(0);
    const hits = JSON.parse(out.text()) as { data: { coreName: string } }[];
    expect(hits.map((h) => h.data.coreName).sort()).toEqual(["billing", "orders"]);

    const narrowed = collectStream();
    const base = path.join(root, "packages", "core-orders");
    const code2 = await runCli(["candidates", "--rule", "core-models", "--base", base], {
      cwd: root,
      stdout: narrowed.stream,
      stderr: collectStream().stream,
    });
    expect(code2).toBe(0);
    const hits2 = JSON.parse(narrowed.text()) as { data: { coreName: string } }[];
    expect(hits2.map((h) => h.data.coreName)).toEqual(["orders"]);
  });

  it("run scaffolds from --input JSON without blocking on stdin", async () => {
    const out = collectStream();
    const err = collectStream();
    const code = await runCli(["run", "note", "--input", JSON.stringify({ name: "hello" })], {
      cwd: root,
      stdout: out.stream,
      stderr: err.stream,
    });
    expect(code).toBe(0);
    expect(err.text()).toBe("");
    const json = JSON.parse(out.text()) as { generator: string; failures: unknown[] };
    expect(json.generator).toBe("note");
    expect(json.failures).toEqual([]);
    expect(readFileSync(path.join(root, "notes", "hello.txt"), "utf8")).toBe("hello hello\n");
  });

  it("run with missing/invalid input exits non-zero and never waits on stdin", async () => {
    const missing = collectStream();
    const codeMissing = await runCli(["run", "note"], {
      cwd: root,
      stdout: collectStream().stream,
      stderr: missing.stream,
    });
    expect(codeMissing).toBe(1);
    expect(JSON.parse(missing.text())).toMatchObject({
      ok: false,
      error: expect.stringMatching(/usage: plop-os run/),
    });

    const badJson = collectStream();
    const codeBad = await runCli(["run", "note", "--input", "{"], {
      cwd: root,
      stdout: collectStream().stream,
      stderr: badJson.stream,
    });
    expect(codeBad).toBe(1);
    expect(JSON.parse(badJson.text())).toMatchObject({
      ok: false,
      error: expect.stringMatching(/invalid --input JSON/),
    });

    const incomplete = collectStream();
    const codeIncomplete = await runCli(["run", "note", "--input", "{}"], {
      cwd: root,
      stdout: collectStream().stream,
      stderr: incomplete.stream,
    });
    expect(codeIncomplete).toBe(1);
    expect(JSON.parse(incomplete.text())).toMatchObject({
      ok: false,
      error: expect.stringMatching(/missing required inputs: name/),
    });
  });

  it("sync updates marked regions; --id filters", async () => {
    const out = collectStream();
    const code = await runCli(["sync", "--id", "models-barrel"], {
      cwd: root,
      stdout: out.stream,
      stderr: collectStream().stream,
    });
    expect(code).toBe(0);
    const json = JSON.parse(out.text()) as { regionsUpdated: number; filesWritten: string[] };
    expect(json.regionsUpdated).toBe(1);
    expect(json.filesWritten.length).toBe(1);
    const barrel = readFileSync(
      path.join(root, "packages", "core-orders", "models", "index.ts"),
      "utf8"
    );
    expect(barrel).toContain('export * from "./billing.stub.js";');
    expect(barrel).toContain('export * from "./orders.stub.js";');
    expect(barrel).not.toContain("old");
  });

  it("unknown command and missing plopfile exit non-zero with JSON stderr", async () => {
    const err = collectStream();
    const code = await runCli(["nope"], {
      cwd: root,
      stdout: collectStream().stream,
      stderr: err.stream,
    });
    expect(code).toBe(1);
    expect(JSON.parse(err.text())).toMatchObject({
      ok: false,
      error: expect.stringMatching(/unknown command: nope/),
    });

    const empty = mkdtempSync(path.join(tmpdir(), "plop-os-cli-empty-"));
    try {
      const err2 = collectStream();
      const code2 = await runCli(["generators"], {
        cwd: empty,
        stdout: collectStream().stream,
        stderr: err2.stream,
      });
      expect(code2).toBe(1);
      expect(JSON.parse(err2.text())).toMatchObject({
        ok: false,
        error: expect.stringMatching(/no plopfile found/),
      });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("dist/cli.js bin smoke: generators via node", () => {
    const stdout = execFileSync(process.execPath, [cliJs, "generators"], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    });
    const json = JSON.parse(stdout) as { discoveryRules: string[] };
    expect(json.discoveryRules).toEqual(["core-models"]);
  });
});
