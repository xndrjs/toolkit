import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli } from "./run";

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
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-naviql-cli-"));

    for (const [rel, contents] of Object.entries(files)) {
      const abs = join(tempDir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, contents);
    }

    process.chdir(tempDir);
    return tempDir;
  }

  it("exits 0 on --dry-run and prints generated code containing postAri", async () => {
    setupProject({
      "src/post.naviql": `scalar PostId on string;
resource Post(id: PostId): { id title: string }
`,
      "naviql.config.ts": `export default {
  root: ".",
  include: ["src/**/*.naviql"],
  out: "./generated/resources.ts",
};
`,
    });

    const stdoutChunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      stdoutChunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const code = await runCli(["--config", "./naviql.config.ts", "--dry-run"]);

    expect(code).toBe(0);
    const stdout = stdoutChunks.join("");
    expect(stdout).toContain("export const postAri");
    expect(stdout).toContain("export type PostId");
  });

  it("exits 1 on duplicate path/name collisions without writing stdout", async () => {
    setupProject({
      "src/a.naviql": `scalar Id on string;
resource Thing(id: Id): { id }
`,
      "src/b.naviql": `scalar Id on string;
resource Thing(id: Id): { id }
`,
      "naviql.config.ts": `export default {
  root: ".",
  include: ["src/**/*.naviql"],
  out: "./generated/resources.ts",
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

    const code = await runCli(["--config", "./naviql.config.ts", "--dry-run"]);

    expect(code).toBe(1);
    expect(stdoutChunks.join("")).toBe("");
    expect(stderr.join("\n")).toMatch(/DUPLICATE_SCALAR/);
    expect(stderr.join("\n")).toMatch(/DUPLICATE_RESOURCE/);
  });
});
