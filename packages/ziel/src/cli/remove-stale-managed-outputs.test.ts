import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GENERATED_MODULE_HEADER } from "../compile/codegen/compose-generated-module";
import { removeStaleManagedOutputs } from "./remove-stale-managed-outputs";

describe("removeStaleManagedOutputs", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("deletes only stale managed files with the generated header", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-ziel-stale-"));
    const outDir = join(tempDir, "generated");
    mkdirSync(outDir, { recursive: true });

    writeFileSync(join(outDir, "resources.ts"), `${GENERATED_MODULE_HEADER}\nexport const keep;\n`);
    writeFileSync(
      join(outDir, "stale.query.ts"),
      `${GENERATED_MODULE_HEADER}\nexport const stale;\n`
    );
    writeFileSync(
      join(outDir, "index.ts"),
      `${GENERATED_MODULE_HEADER}\nexport * from "./resources";\n`
    );
    writeFileSync(join(outDir, "hand.ts"), "export const hand;\n");
    writeFileSync(join(outDir, "bare-index.ts"), "export const noHeader;\n");
    mkdirSync(join(outDir, "nested"), { recursive: true });
    writeFileSync(
      join(outDir, "nested", "old.query.ts"),
      `${GENERATED_MODULE_HEADER}\nexport const nested;\n`
    );

    const deleted = removeStaleManagedOutputs(outDir, ["resources.ts"]);

    expect(deleted).toEqual(["index.ts", "stale.query.ts"]);
    expect(readFileSync(join(outDir, "resources.ts"), "utf8")).toContain("keep");
    expect(readFileSync(join(outDir, "hand.ts"), "utf8")).toContain("hand");
    expect(readFileSync(join(outDir, "bare-index.ts"), "utf8")).toContain("noHeader");
    expect(readFileSync(join(outDir, "nested", "old.query.ts"), "utf8")).toContain("nested");
  });

  it("returns empty when out dir is missing", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-ziel-stale-"));
    expect(removeStaleManagedOutputs(join(tempDir, "missing"), [])).toEqual([]);
  });
});
