import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeFileIfChanged } from "./write-file-if-changed.js";

describe("writeFileIfChanged", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("creates missing files together with their parent directories", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-write-"));
    const filePath = join(tempDir, "nested/dir/output.ts");

    expect(writeFileIfChanged(filePath, "export {};\n")).toBe(true);
    expect(readFileSync(filePath, "utf8")).toBe("export {};\n");
  });

  it("skips the write when content is unchanged", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-write-"));
    const filePath = join(tempDir, "output.ts");
    writeFileSync(filePath, "export {};\n");
    const mtimeBefore = statSync(filePath).mtimeMs;

    expect(writeFileIfChanged(filePath, "export {};\n")).toBe(false);
    expect(statSync(filePath).mtimeMs).toBe(mtimeBefore);
  });

  it("overwrites the file when content differs", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-write-"));
    const filePath = join(tempDir, "output.ts");
    writeFileSync(filePath, "export const a = 1;\n");

    expect(writeFileIfChanged(filePath, "export const a = 2;\n")).toBe(true);
    expect(readFileSync(filePath, "utf8")).toBe("export const a = 2;\n");
  });
});
