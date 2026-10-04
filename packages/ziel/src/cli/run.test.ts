import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GENERATED_MODULE_HEADER } from "../compile/codegen/compose-generated-module";
import { runCli, validateOutDirectory } from "./run";

describe("validateOutDirectory", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects source-file-looking paths", () => {
    expect(() => validateOutDirectory("./generated/ziel.ts")).toThrow(/must be a directory/);
  });

  it("rejects an existing non-directory path", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-ziel-out-"));
    const filePath = join(tempDir, "not-a-dir");
    writeFileSync(filePath, "x");
    expect(() => validateOutDirectory(filePath)).toThrow(/not a directory/);
  });

  it("allows missing or existing directories", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-ziel-out-"));
    expect(() => validateOutDirectory(join(tempDir, "missing"))).not.toThrow();
    expect(() => validateOutDirectory(tempDir)).not.toThrow();
  });
});

describe("runCli", () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function setupProject(files: Record<string, string>): string {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-ziel-cli-"));

    for (const [rel, contents] of Object.entries(files)) {
      const abs = join(tempDir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, contents);
    }

    process.chdir(tempDir);
    return tempDir;
  }

  it("exits 0 on --dry-run and prints path banners with generated modules", async () => {
    setupProject({
      "src/post.ziel": `scalar PostId on string;
resource Post(id: PostId): { id title: string }
`,
      "ziel.config.ts": `export default {
  root: ".",
  include: ["src/**/*.ziel"],
  out: "./generated",
};
`,
    });

    const stdoutChunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      stdoutChunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const code = await runCli(["--config", "./ziel.config.ts", "--dry-run"]);

    expect(code).toBe(0);
    const stdout = stdoutChunks.join("");
    expect(stdout).toContain("// ===== resources.ts =====");
    expect(stdout).toContain("// ===== index.ts =====");
    expect(stdout).toContain("export const postAri");
    expect(stdout).toContain("export type PostId");
  });

  it("writes multi-file output and removes stale managed query modules", async () => {
    const root = setupProject({
      "src/post.ziel": `scalar PostId on string;
resource Post(id: PostId): { id title: string }

query PostDetail(id: PostId) {
  context { }
  root Post(id: id)
  on Post post { id title }
}
`,
      "ziel.config.ts": `export default {
  root: ".",
  include: ["src/**/*.ziel"],
  out: "./generated",
};
`,
      "generated/old-query.query.ts": `${GENERATED_MODULE_HEADER}\nexport const stale = true;\n`,
      "generated/hand-written.ts": "export const keep = true;\n",
      "generated/index.ts": `${GENERATED_MODULE_HEADER}\nexport * from "./resources";\n`,
    });

    const code = await runCli(["--config", "./ziel.config.ts"]);

    expect(code).toBe(0);
    expect(existsSync(join(root, "generated", "resources.ts"))).toBe(true);
    expect(existsSync(join(root, "generated", "post-detail.query.ts"))).toBe(true);
    expect(existsSync(join(root, "generated", "index.ts"))).toBe(true);
    expect(existsSync(join(root, "generated", "old-query.query.ts"))).toBe(false);
    expect(readFileSync(join(root, "generated", "hand-written.ts"), "utf8")).toBe(
      "export const keep = true;\n"
    );
    expect(readFileSync(join(root, "generated", "resources.ts"), "utf8")).toContain(
      "export const postAri"
    );
  });

  it("exits 1 on duplicate path/name collisions without writing stdout", async () => {
    setupProject({
      "src/a.ziel": `scalar Id on string;
resource Thing(id: Id): { id }
`,
      "src/b.ziel": `scalar Id on string;
resource Thing(id: Id): { id }
`,
      "ziel.config.ts": `export default {
  root: ".",
  include: ["src/**/*.ziel"],
  out: "./generated",
};
`,
    });

    const stdoutChunks: string[] = [];
    const stderr: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      stdoutChunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      stderr.push(args.map(String).join(" "));
    });

    const code = await runCli(["--config", "./ziel.config.ts", "--dry-run"]);

    expect(code).toBe(1);
    expect(stdoutChunks.join("")).toBe("");
    expect(stderr.join("\n")).toMatch(/DUPLICATE_SCALAR/);
    expect(stderr.join("\n")).toMatch(/DUPLICATE_RESOURCE/);
  });

  it("rejects config out paths that point at a TypeScript file", async () => {
    setupProject({
      "src/post.ziel": `scalar PostId on string;\nresource Post(id: PostId): { id }\n`,
      "ziel.config.ts": `export default {
  root: ".",
  include: ["src/**/*.ziel"],
  out: "./generated/resources.ts",
};
`,
    });

    await expect(runCli(["--config", "./ziel.config.ts", "--dry-run"])).rejects.toThrow(
      /must be a directory/
    );
  });
});
